// Le Coffre — échéances des papiers du foyer. Adultes uniquement (RLS).
// Le stockage des fichiers (scans) arrive en phase 4 ; les rappels, eux, marchent déjà.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { muter } from '@/lib/sync'
import { lireAvecRepli } from '@/lib/lecture'
import { utiliserSession } from '@/etat/session'
import { differenceInCalendarDays, maintenantLocal } from '@/lib/dates'
import type { LigneDocument } from '@/lib/basedonnees.types'
import { Bouton } from '@/design/composants/Bouton'
import { Feuille } from '@/design/composants/Feuille'
import { ChampTexte } from '@/design/composants/ChampTexte'
import { EtatVide } from '@/design/composants/EtatVide'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { BarreRetour } from '@/design/composants/BarreRetour'

const TYPES: { valeur: LigneDocument['type']; libelle: string }[] = [
  { valeur: 'identite', libelle: 'Identité' },
  { valeur: 'sante', libelle: 'Santé' },
  { valeur: 'assurance', libelle: 'Assurance' },
  { valeur: 'garantie', libelle: 'Garantie' },
  { valeur: 'vehicule', libelle: 'Véhicule' },
  { valeur: 'logement', libelle: 'Logement' },
  { valeur: 'ecole', libelle: 'École' },
  { valeur: 'autre', libelle: 'Autre' },
]

export function utiliserDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () =>
      lireAvecRepli<LigneDocument>('documents', async () => {
        const { data, error } = await supabase.from('documents').select('*').order('expire_le', { nullsFirst: false })
        if (error) throw error
        return data
      }),
  })
}

export function EcranCoffre() {
  const { membre, membres, foyer } = utiliserSession()
  const clientRequetes = useQueryClient()
  const documents = utiliserDocuments()
  const [creation, setCreation] = useState(false)

  if (membre?.role !== 'adult') return null

  return (
    <div className="px-5 pt-3">
      <BarreRetour vers="/nous" />
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-titre-3 text-encre">Le Coffre</h2>
        <Bouton variante="discret" onClick={() => setCreation(true)} etiquette="Nouveau document">+</Bouton>
      </div>
      <p className="mb-3 text-note text-encre-3">
        Passeports, carte grise, garanties… Rappel automatique à J-60 avant expiration.
      </p>

      {(documents.data?.length ?? 0) === 0 && !documents.isLoading && (
        <EtatVide titre="Coffre vide" message="Ajoute un papier avec sa date d’expiration — plus jamais de passeport périmé à l’aéroport." />
      )}

      <ul className="flex flex-col gap-1">
        {(documents.data ?? []).map((d) => {
          const proprietaire = membres.find((m) => m.id === d.membre_id)
          const dans = d.expire_le
            ? differenceInCalendarDays(new Date(`${d.expire_le}T12:00:00`), maintenantLocal())
            : null
          return (
            <li key={d.id} className="flex items-center gap-3 rounded-md bg-fond-eleve px-3 py-2 shadow-carte">
              <div className="flex-1">
                <p className="text-corps text-encre">{d.titre}</p>
                <p className="text-legende text-encre-3">{TYPES.find((t) => t.valeur === d.type)?.libelle}</p>
              </div>
              {dans !== null && (
                <span
                  className={`chiffres text-note ${dans < 0 ? 'font-[590] text-urgent' : dans <= 60 ? 'font-[590] text-ambre' : 'text-encre-3'}`}
                >
                  {dans < 0 ? 'expiré' : `J-${dans}`}
                </span>
              )}
              {proprietaire && <PastilleMembre membre={proprietaire} taille={22} />}
              <button
                onClick={() =>
                  void muter({ table: 'documents', type: 'delete', cible_id: d.id, charge: {} }).then(() =>
                    clientRequetes.invalidateQueries({ queryKey: ['documents'] }),
                  )
                }
                aria-label={`Supprimer ${d.titre}`}
                className="min-h-[32px] min-w-[32px] text-note text-encre-3"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>

      <Feuille ouverte={creation} onFermer={() => setCreation(false)} titre="Nouveau document">
        {foyer && (
          <FormDocument
            surCreation={async (b) => {
              const id = crypto.randomUUID()
              await muter({
                table: 'documents', type: 'insert', cible_id: id,
                charge: { id, foyer_id: foyer.id, file_path: null, rappels: [60, 15], ...b },
              })
              await clientRequetes.invalidateQueries({ queryKey: ['documents'] })
              setCreation(false)
            }}
          />
        )}
      </Feuille>
    </div>
  )
}

function FormDocument({
  surCreation,
}: {
  surCreation: (b: {
    titre: string
    type: LigneDocument['type']
    membre_id: string | null
    expire_le: string | null
  }) => Promise<void>
}) {
  const { membres } = utiliserSession()
  const [titre, setTitre] = useState('')
  const [type, setType] = useState<LigneDocument['type']>('identite')
  const [proprietaire, setProprietaire] = useState<string | null>(null)
  const [expire, setExpire] = useState('')
  return (
    <div className="flex flex-col gap-3">
      <ChampTexte etiquette="Titre" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Passeport Gabriel" />
      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.valeur}
            onClick={() => setType(t.valeur)}
            aria-pressed={type === t.valeur}
            className={`min-h-sur-tactile rounded-full px-3 text-note font-[500]
              ${type === t.valeur ? 'bg-encre text-fond' : 'bg-fond-sourd text-encre-2'}`}
          >
            {t.libelle}
          </button>
        ))}
      </div>
      <div>
        <span className="mb-1 block text-note font-[500] text-encre-2">Concerne (facultatif)</span>
        <div className="flex gap-1">
          {membres.filter((m) => m.role !== 'guest').map((m) => (
            <PastilleMembre
              key={m.id}
              membre={m}
              taille={34}
              estompee={proprietaire !== null && proprietaire !== m.id}
              onClick={() => setProprietaire(proprietaire === m.id ? null : m.id)}
            />
          ))}
        </div>
      </div>
      <ChampTexte etiquette="Expire le (facultatif)" type="date" value={expire} onChange={(e) => setExpire(e.target.value)} />
      <Bouton
        pleineLargeur
        onClick={() => {
          if (titre.trim())
            void surCreation({ titre: titre.trim(), type, membre_id: proprietaire, expire_le: expire || null })
        }}
      >
        Ajouter au Coffre
      </Bouton>
    </div>
  )
}
