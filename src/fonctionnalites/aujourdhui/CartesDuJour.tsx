// Les cartes du jour : uniquement ce qui est actionnable aujourd'hui.
// Pas de statistiques, pas de graphique, pas de « bonjour ! ».
import type { LigneCelebration, LigneMembre, LigneTache } from '@/lib/basedonnees.types'
import { Carte } from '@/design/composants/Carte'
import { Coche } from '@/design/composants/Coche'
import { PastilleMembre } from '@/design/composants/PastilleMembre'
import { couleurMembre } from '@/lib/couleurs'
import { dateIsoJour, differenceInCalendarDays, maintenantLocal } from '@/lib/dates'

interface Props {
  taches: LigneTache[]
  celebrations: LigneCelebration[]
  membres: LigneMembre[]
  onCompleter: (tache: LigneTache) => void
}

export function CartesDuJour({ taches, celebrations, membres, onCompleter }: Props) {
  const aujourdHui = dateIsoJour(maintenantLocal())
  const dues = taches.filter((t) => t.echeance !== null && t.echeance <= aujourdHui)

  if (dues.length === 0 && celebrations.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {dues.length > 0 && (
        <Carte>
          <h2 className="mb-2 text-note font-[590] uppercase tracking-wide text-encre-3">
            À faire aujourd’hui
          </h2>
          <ul>
            {dues.map((tache) => {
              const assignee = membres.find((m) => m.id === tache.assignee_id)
              const enRetard = tache.echeance !== null && tache.echeance < aujourdHui
              return (
                <li key={tache.id} className="flex items-center gap-2 border-b border-trait py-1 last:border-0">
                  <Coche
                    cochee={false}
                    onBascule={() => onCompleter(tache)}
                    etiquette={`Marquer « ${tache.titre} » comme faite`}
                    couleur={assignee ? couleurMembre(assignee.couleur) : undefined}
                  />
                  <span className="flex-1 text-corps text-encre">{tache.titre}</span>
                  {enRetard && <span className="text-legende font-[590] text-urgent">en retard</span>}
                  {assignee && <PastilleMembre membre={assignee} taille={22} />}
                </li>
              )
            })}
          </ul>
        </Carte>
      )}

      {celebrations.map((celebration) => {
        const date = new Date(celebration.date)
        const maintenant = maintenantLocal()
        const anniversaire = new Date(maintenant.getFullYear(), date.getMonth(), date.getDate())
        if (anniversaire < new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())) {
          anniversaire.setFullYear(anniversaire.getFullYear() + 1)
        }
        const dansXJours = differenceInCalendarDays(anniversaire, maintenant)
        return (
          <Carte key={celebration.id}>
            <p className="text-corps text-encre">
              🎂 {celebration.nom}
              <span className="text-encre-3">
                {' '}
                — {dansXJours === 0 ? 'aujourd’hui' : `dans ${dansXJours} jour${dansXJours > 1 ? 's' : ''}`}
              </span>
            </p>
          </Carte>
        )
      })}
    </div>
  )
}
