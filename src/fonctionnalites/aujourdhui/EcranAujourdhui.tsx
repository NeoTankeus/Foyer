// L'écran Aujourd'hui : Le Fil, le brief, les cartes du jour. Rien d'autre.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utiliserSession } from '@/etat/session'
import {
  completerTache,
  supprimerEvenement,
  utiliserCelebrationsProches,
  utiliserEvenementsDuJour,
  utiliserTachesOuvertes,
} from '@/lib/requetes'
import { formatHeure, formatJourLong, maintenantLocal } from '@/lib/dates'
import type { LigneEvenement } from '@/lib/basedonnees.types'
import { LeFil } from './fil/LeFil'
import { BriefGastif } from './BriefGastif'
import { CartesDuJour } from './CartesDuJour'
import { Feuille } from '@/design/composants/Feuille'
import { Bouton } from '@/design/composants/Bouton'
import { EtatVide } from '@/design/composants/EtatVide'

export function EcranAujourdhui() {
  const { membre, membres } = utiliserSession()
  const clientRequetes = useQueryClient()
  const evenements = utiliserEvenementsDuJour()
  const taches = utiliserTachesOuvertes()
  const celebrations = utiliserCelebrationsProches(7)
  const [evenementOuvert, setEvenementOuvert] = useState<LigneEvenement | null>(null)
  const [confirmeSuppression, setConfirmeSuppression] = useState(false)

  // Papiers qui expirent sous 60 jours — visible des adultes seulement (RLS).
  const papiersExpirants = useQuery({
    queryKey: ['documents', 'expirants'],
    queryFn: async () => {
      const limite = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .not('expire_le', 'is', null)
        .lte('expire_le', limite)
        .order('expire_le')
      if (error) return []
      return data
    },
    enabled: membre?.role === 'adult',
  })


  return (
    <div className="pb-4">
      <header className="verre verre-clair safe-haut sticky top-0 z-10 px-5 pb-2 pt-3">
        <h1 className="text-titre-2 capitalize text-encre">{formatJourLong(maintenantLocal())}</h1>
      </header>

      <div className="px-4">
        {evenements.isLoading ? (
          <p className="px-1 py-8 text-corps-2 text-encre-3">Un instant…</p>
        ) : (
          <LeFil
            membres={membres}
            evenements={evenements.data ?? []}
            onSelection={(evenement) => {
              setConfirmeSuppression(false)
              setEvenementOuvert(evenement)
            }}
          />
        )}

        <div className="mt-2 flex flex-col gap-4">
          <BriefGastif evenements={evenements.data ?? []} taches={taches.data ?? []} />
          <CartesDuJour
            taches={taches.data ?? []}
            celebrations={celebrations.data ?? []}
            membres={membres}
            onCompleter={(tache) => {
              if (!membre) return
              void completerTache(tache, membre.id, membres).then(() =>
                clientRequetes.invalidateQueries({ queryKey: ['taches'] }),
              )
            }}
          />
          {(papiersExpirants.data?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-fond-eleve p-4 shadow-carte">
              <h2 className="mb-1 text-note font-[590] uppercase tracking-wide text-encre-3">
                🗄️ Papiers à renouveler
              </h2>
              {(papiersExpirants.data ?? []).map((d) => (
                <p key={d.id} className="text-corps-2 text-encre">
                  {d.titre}
                  <span className="chiffres text-encre-3">
                    {' '}
                    — expire le {new Date(`${d.expire_le}T12:00:00`).toLocaleDateString('fr-FR')}
                  </span>
                </p>
              ))}
            </div>
          )}
          {(evenements.data?.length ?? 0) === 0 && !evenements.isLoading && (
            <EtatVide
              titre="Journée libre"
              message="Aucun événement aujourd’hui. Le Fil se tisse depuis l’Agenda."
            />
          )}
        </div>
      </div>

      <Feuille
        ouverte={evenementOuvert !== null}
        onFermer={() => setEvenementOuvert(null)}
        titre={evenementOuvert?.titre ?? ''}
      >
        {evenementOuvert && (
          <div className="flex flex-col gap-3">
            <p className="chiffres text-corps text-encre-2">
              {evenementOuvert.journee_entiere
                ? 'Toute la journée'
                : `${formatHeure(evenementOuvert.debut_a)} – ${formatHeure(evenementOuvert.fin_a)}`}
              {evenementOuvert.lieu ? ` · ${evenementOuvert.lieu}` : ''}
            </p>
            {evenementOuvert.notes && (
              <p className="text-corps-2 text-encre-3">{evenementOuvert.notes}</p>
            )}
            {membre?.role === 'adult' &&
              (confirmeSuppression ? (
                <Bouton
                  variante="urgent"
                  pleineLargeur
                  onClick={() => {
                    void supprimerEvenement(evenementOuvert.id).then(() =>
                      clientRequetes.invalidateQueries({ queryKey: ['evenements'] }),
                    )
                    setEvenementOuvert(null)
                  }}
                >
                  Confirmer la suppression
                </Bouton>
              ) : (
                <Bouton variante="discret" pleineLargeur onClick={() => setConfirmeSuppression(true)}>
                  Supprimer cet événement
                </Bouton>
              ))}
          </div>
        )}
      </Feuille>
    </div>
  )
}
