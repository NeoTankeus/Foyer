// Anniversaires & coffre à idées. Les idées sont invisibles au rôle enfant — RLS.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import type { LigneCelebration, LigneIdeeCadeau } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { Coche } from '@/design/composants/Coche'
import { BarreRetour } from '@/design/composants/BarreRetour'

function prochaineOccurrence(dateIso: string): Date {
  const date = new Date(dateIso)
  const maintenant = maintenantLocal()
  const prochaine = new Date(maintenant.getFullYear(), date.getMonth(), date.getDate())
  if (prochaine < new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())) {
    prochaine.setFullYear(prochaine.getFullYear() + 1)
  }
  return prochaine
}

export function EcranCelebrations() {
  const { membre, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [creation, setCreation] = useState(false)
  const [ouverte, setOuverte] = useState<LigneCelebration | null>(null)

  const celebrations = useQuery({
    queryKey: ['celebrations', 'toutes'],
    queryFn: () =>
      lireAvecRepli<LigneCelebration>('celebrations', async () => {
        const { data, error } = await supabase.from('celebrations').select('*')
        if (error) throw error
        return data
      }),
  })

  const triees = [...(celebrations.data ?? [])].sort(
    (a, b) => prochaineOccurrence(a.date).getTime() - prochaineOccurrence(b.date).getTime(),
  )

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['celebrations'] })

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-titre-3 text-encre">Célébrations</h2>
        {membre?.role === 'adult' && (
          <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouvelle célébration">+</Bouton>
        )}
      </div>

      {triees.length === 0 && !celebrations.isLoading && (
        <EtatVide titre="Personne à fêter ?" message="Ajoute les anniversaires — l’app rappelle à J-21, J-7, J-1 et le jour J." />
      )}

      <ul className="flex flex-col gap-1">
        {triees.map((c) => {
          const dans = differenceInCalendarDays(prochaineOccurrence(c.date), maintenantLocal())
          return (
            <li key={c.id}>
              <button
                onClick={() => setOuverte(c)}
                className="flex min-h-sur-tactile w-full items-center gap-3 rounded-md bg-fond-eleve px-3 py-2 text-left shadow-carte"
              >
                <div className="flex-1">
                  <p className="text-corps text-encre">{c.nom}</p>
                  <p className="text-legende text-encre-3">{c.relation ?? ''}</p>
                </div>
                <span className={`chiffres text-note ${dans <= 7 ? 'font-[590] text-ambre' : 'text-encre-3'}`}>
                  {dans === 0 ? 'aujourd’hui' : `J-${dans}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouvelle célébration">
        {foyer && (
          <FormCelebration
            surCreation={async (brouillon) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'celebrations', type: 'insert', cible_id: id,
                charge: { id, foyer_id: foyer.id, rappels: [21, 7, 1, 0], magie: false, membre_id: null, ...brouillon },
              })
              await rafraichir()
              setCreation(false)
            }}
          />
        )}
      </Feuille>

      <Feuille ouverte={ouverte !== null} onFermer={() => setOuverte(null)} titre={ouverte?.nom ?? ''}>
        {ouverte && membre?.role === 'adult' && <CoffreAIdees celebration={ouverte} />}
      </Feuille>
    </div>
  )
}

function FormCelebration({
  surCreation,
}: {
  surCreation: (b: { nom: string; date: string; relation: string | null }) => Promise<void>
}) {
  const [nom, setNom] = useState('')
  const [date, setDate] = useState('')
  const [relation, setRelation] = useState('')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Qui ?" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Mamie Jacqueline" />
      <ChampTexte etiquette="Date (l’année sert à calculer l’âge)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <ChampTexte etiquette="Relation (facultatif)" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="grand-mère, copain d’école…" />
      <Bouton pleineLargeur onClick={() => { if (nom.trim() && date) void surCreation({ nom: nom.trim(), date, relation: relation.trim() || null }) }}>
        Ajouter
      </Bouton>
    </div>
  )
}

/** Toute l'année on note ce que la personne évoque. En novembre, on n'est pas démuni. */
function CoffreAIdees({ celebration }: { celebration: LigneCelebration }) {
  const { foyer, membre } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [idee, setIdee] = useState('')
  const [lien, setLien] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [majEnCours, setMajEnCours] = useState(false)

  const analyserLien = async (url: string): Promise<{ titre: string | null; image: string | null; prix: number | null }> => {
    const { data: session } = await supabase.auth.getSession()
    const reponse = await fetch('/api/analyser-lien', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ url }),
    })
    const donnees = (await reponse.json()) as { produit?: { titre: string | null; image: string | null; prix: number | null } }
    return donnees.produit ?? { titre: null, image: null, prix: null }
  }

  const ajouterDepuisLien = async () => {
    const url = lien.trim()
    if (!url || !foyer || !membre) return
    setAnalyseEnCours(true)
    try {
      const produit = await analyserLien(url)
      const id = crypto.randomUUID()
      await muter({
        table: 'idees_cadeaux', type: 'insert', cible_id: id,
        charge: {
          id, foyer_id: foyer.id, celebration_id: celebration.id,
          libelle: produit.titre ?? url.replace(/^https?:\/\//, '').slice(0, 60),
          note: null, prix: produit.prix, url, image_url: produit.image,
          offert: false, offert_le: null, cree_par: membre.id,
        },
      })
      setLien('')
      await clientRequetes.invalidateQueries({ queryKey: ['idees', celebration.id] })
    } finally {
      setAnalyseEnCours(false)
    }
  }

  const actualiserPrix = async () => {
    setMajEnCours(true)
    try {
      for (const i of (idees.data ?? []).filter((x) => x.url && !x.offert)) {
        const produit = await analyserLien(i.url ?? '')
        if (produit.prix !== null) {
          await muter({ table: 'idees_cadeaux', type: 'update', cible_id: i.id, charge: { prix: produit.prix } })
        }
      }
      await clientRequetes.invalidateQueries({ queryKey: ['idees', celebration.id] })
    } finally {
      setMajEnCours(false)
    }
  }

  const idees = useQuery({
    queryKey: ['idees', celebration.id],
    queryFn: async () => {
      const lignes = await lireAvecRepli<LigneIdeeCadeau>('idees_cadeaux', async () => {
        const { data, error } = await supabase
          .from('idees_cadeaux')
          .select('*')
          .eq('celebration_id', celebration.id)
        if (error) throw error
        return data
      })
      return lignes.filter((i) => i.celebration_id === celebration.id)
    },
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['idees', celebration.id] })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-note text-encre-3">
        Le coffre à idées — invisible pour Gabriel, verrouillé au niveau de la base.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!idee.trim() || !foyer || !membre) return
          const id = crypto.randomUUID()
          void muter({
            table: 'idees_cadeaux', type: 'insert', cible_id: id,
            charge: {
              id, foyer_id: foyer.id, celebration_id: celebration.id, libelle: idee.trim(),
              note: null, prix: null, offert: false, offert_le: null, cree_par: membre.id,
            },
          }).then(rafraichir)
          setIdee('')
        }}
      >
        <input
          value={idee}
          onChange={(e) => setIdee(e.target.value)}
          placeholder="Il/elle a parlé de…"
          aria-label="Nouvelle idée cadeau"
          className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps"
        />
        <Bouton type="submit" variante="discret">Noter</Bouton>
      </form>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ajouterDepuisLien()
        }}
      >
        <input
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder="🔗 Coller le lien du produit (Amazon, Fnac…)"
          aria-label="Lien du produit"
          inputMode="url"
          className="min-h-sur-tactile flex-1 rounded-md border border-trait bg-fond-eleve px-3 text-corps-2"
        />
        <Bouton type="submit" variante="valider" desactive={analyseEnCours}>
          {analyseEnCours ? '…' : 'OK'}
        </Bouton>
      </form>
      {(idees.data ?? []).some((i) => i.url) && (
        <Bouton variante="discret" pleineLargeur desactive={majEnCours} onClick={() => void actualiserPrix()}>
          {majEnCours ? 'Mise à jour des prix…' : '🔄 Actualiser les prix'}
        </Bouton>
      )}

      <ul className="flex flex-col gap-1">
        {(idees.data ?? []).map((i) => (
          <li key={i.id} className="flex items-center gap-1 rounded-md bg-fond-sourd px-2">
            <Coche
              cochee={i.offert}
              onBascule={() =>
                void muter({
                  table: 'idees_cadeaux', type: 'update', cible_id: i.id,
                  charge: { offert: !i.offert, offert_le: i.offert ? null : new Date().toISOString().slice(0, 10) },
                }).then(rafraichir)
              }
              etiquette={`Marquer « ${i.libelle} » comme offert`}
            />
            {i.image_url && (
              <img src={i.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            )}
            <span className={`flex-1 py-2 text-corps-2 ${i.offert ? 'text-encre-3 line-through' : 'text-encre'}`}>
              {i.libelle}
              <span className="block text-legende text-encre-3">
                {i.prix !== null && <strong className="chiffres text-encre-2">{i.prix.toFixed(2)} € </strong>}
                {i.url && (
                  <a href={i.url} target="_blank" rel="noopener" className="text-ardoise underline" onClick={(e) => e.stopPropagation()}>
                    voir
                  </a>
                )}
                {i.url && ' · '}
                {i.libelle.length > 3 && (
                  <a
                    href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(i.libelle)}`}
                    target="_blank" rel="noopener" className="text-ardoise underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    moins cher ?
                  </a>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {(idees.data?.length ?? 0) > 0 && (
        <p className="text-legende text-encre-3">Coché = offert. Plus jamais de doublon.</p>
      )}
    </div>
  )
}
