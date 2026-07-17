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
      <div className="flex items-center justify-between pb-2">
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
            <span className={`flex-1 py-2 text-corps-2 ${i.offert ? 'text-encre-3 line-through' : 'text-encre'}`}>
              {i.libelle}
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
