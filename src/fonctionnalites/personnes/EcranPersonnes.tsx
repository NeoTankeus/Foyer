// La Mémoire des gens : une fiche par proche — goûts, tailles, allergies,
// et ce qu'on lui a déjà offert (relié aux célébrations). Adultes seulement.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import type { LignePersonne } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { BarreRetour } from '@/design/composants/BarreRetour'

export function EcranPersonnes() {
  const { foyer, membre } = utiliserSession()
  const clientRequetes = useQueryClient()
  const [enEdition, setEnEdition] = useState<LignePersonne | 'nouvelle' | null>(null)
  const [confirmeSuppr, setConfirmeSuppr] = useState<string | null>(null)

  const personnes = useQuery({
    queryKey: ['personnes'],
    queryFn: () =>
      lireAvecRepli<LignePersonne>('personnes', async () => {
        const { data, error } = await supabase.from('personnes').select('*').order('prenom')
        if (error) throw error
        return data
      }),
  })

  // Les cadeaux déjà offerts, retrouvés par le prénom de la célébration.
  const offerts = useQuery({
    queryKey: ['idees', 'offerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('idees_cadeaux').select('*').eq('offert', true).order('offert_le', { ascending: false })
      if (error) return []
      const { data: celebrations } = await supabase.from('celebrations').select('*')
      return (data ?? []).map((i) => ({
        idee: i,
        nomCelebration: (celebrations ?? []).find((c) => c.id === i.celebration_id)?.nom ?? '',
      }))
    },
  })

  const rafraichir = () => clientRequetes.invalidateQueries({ queryKey: ['personnes'] })

  const cadeauxDe = (prenom: string) =>
    (offerts.data ?? []).filter((o) => o.nomCelebration.toLowerCase().includes(prenom.toLowerCase()))

  if (membre?.role !== 'adult') return null

  return (
    <div className="px-5 pb-6 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between gap-3 pb-1">
        <h2 className="text-titre-3 text-encre">👥 Les proches</h2>
        <Bouton variante="discret" onClick={() => setEnEdition('nouvelle')} etiquette="Nouvelle fiche">+</Bouton>
      </div>
      <p className="pb-3 text-note text-encre-3">
        Goûts, tailles, allergies, cadeaux déjà offerts — StiGa s’en souvient pour toi.
      </p>

      {(personnes.data?.length ?? 0) === 0 && !personnes.isLoading && (
        <EtatVide titre="Personne encore" message="Crée une fiche par proche : plus jamais « il fait quelle taille déjà ? »." />
      )}

      <ul className="flex flex-col gap-2">
        {(personnes.data ?? []).map((p) => {
          const cadeaux = cadeauxDe(p.prenom)
          return (
            <li key={p.id} className="rounded-xl bg-fond-eleve p-4 shadow-carte">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-corps font-[590] text-encre">{p.prenom}</p>
                  {p.relation && <p className="text-legende text-encre-3">{p.relation}</p>}
                </div>
                <Bouton variante="discret" onClick={() => setEnEdition(p)}>Modifier</Bouton>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-corps-2 text-encre-2">
                {p.gouts && <p>💛 {p.gouts}</p>}
                {p.tailles && <p>📏 {p.tailles}</p>}
                {p.allergies && <p className="text-urgent">⚠️ {p.allergies}</p>}
                {p.notes && <p className="text-encre-3">📝 {p.notes}</p>}
                {cadeaux.length > 0 && (
                  <p className="text-encre-3">
                    🎁 Déjà offert : {cadeaux.slice(0, 4).map((c) => c.idee.libelle).join(', ')}
                    {cadeaux.length > 4 ? '…' : ''}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Feuille
        ouverte={enEdition !== null}
        onFermer={() => setEnEdition(null)}
        titre={enEdition === 'nouvelle' ? 'Nouvelle fiche' : `Fiche de ${enEdition?.prenom ?? ''}`}
      >
        {enEdition !== null && foyer && (
          <FormPersonne
            initiale={enEdition === 'nouvelle' ? null : enEdition}
            surEnregistrement={async (valeurs) => {
              if (enEdition === 'nouvelle') {
                const id = crypto.randomUUID()
                await muter({
                  table: 'personnes', type: 'insert', cible_id: id,
                  charge: { id, foyer_id: foyer.id, cree_le: new Date().toISOString(), ...valeurs },
                })
              } else {
                await muter({ table: 'personnes', type: 'update', cible_id: enEdition.id, charge: valeurs })
              }
              await rafraichir()
              setEnEdition(null)
            }}
            surSuppression={
              enEdition === 'nouvelle'
                ? undefined
                : async () => {
                    if (confirmeSuppr !== enEdition.id) {
                      setConfirmeSuppr(enEdition.id)
                      return
                    }
                    await muter({ table: 'personnes', type: 'delete', cible_id: enEdition.id, charge: {} })
                    setConfirmeSuppr(null)
                    await rafraichir()
                    setEnEdition(null)
                  }
            }
            confirme={enEdition !== 'nouvelle' && confirmeSuppr === enEdition.id}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormPersonne({
  initiale,
  surEnregistrement,
  surSuppression,
  confirme,
}: {
  initiale: LignePersonne | null
  surEnregistrement: (v: {
    prenom: string
    relation: string | null
    gouts: string | null
    tailles: string | null
    allergies: string | null
    notes: string | null
  }) => Promise<void>
  surSuppression?: () => Promise<void>
  confirme: boolean
}) {
  const [prenom, setPrenom] = useState(initiale?.prenom ?? '')
  const [relation, setRelation] = useState(initiale?.relation ?? '')
  const [gouts, setGouts] = useState(initiale?.gouts ?? '')
  const [tailles, setTailles] = useState(initiale?.tailles ?? '')
  const [allergies, setAllergies] = useState(initiale?.allergies ?? '')
  const [notes, setNotes] = useState(initiale?.notes ?? '')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Mamie Jacqueline" />
      <ChampTexte etiquette="Relation" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="grand-mère, copain d’école…" />
      <ChampTexte etiquette="Goûts (ce qu’il/elle aime)" value={gouts} onChange={(e) => setGouts(e.target.value)} placeholder="orchidées, polars, thé vert…" />
      <ChampTexte etiquette="Tailles" value={tailles} onChange={(e) => setTailles(e.target.value)} placeholder="pull 40, pointure 38…" />
      <ChampTexte etiquette="Allergies / à éviter" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="arachides… ou « pas de parfum »" />
      <ChampTexte etiquette="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="tout ce qui aide…" />
      <Bouton
        pleineLargeur
        variante="valider"
        onClick={() => {
          if (!prenom.trim()) return
          void surEnregistrement({
            prenom: prenom.trim(),
            relation: relation.trim() || null,
            gouts: gouts.trim() || null,
            tailles: tailles.trim() || null,
            allergies: allergies.trim() || null,
            notes: notes.trim() || null,
          })
        }}
      >
        Enregistrer
      </Bouton>
      {surSuppression && (
        <Bouton pleineLargeur variante={confirme ? 'urgent' : 'discret'} onClick={() => void surSuppression()}>
          {confirme ? 'Confirmer la suppression ?' : 'Supprimer cette fiche'}
        </Bouton>
      )}
    </div>
  )
}
