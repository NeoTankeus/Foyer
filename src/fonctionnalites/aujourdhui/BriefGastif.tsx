// Le brief du matin. En phase 1 il est calculé localement, sans IA — honnête.
// En phase 2, Gastif le génère à 6 h et le pousse en notification.
import type { LigneEvenement, LigneTache } from '@/lib/basedonnees.types'
import { formatHeure, maintenantLocal } from '@/lib/dates'

interface Props {
  evenements: LigneEvenement[]
  taches: LigneTache[]
}

function composer(evenements: LigneEvenement[], taches: LigneTache[]): string {
  const phrases: string[] = []
  const maintenant = maintenantLocal()

  const aVenir = evenements
    .filter((e) => !e.journee_entiere)
    .filter((e) => new Date(e.debut_a) > new Date())
  const prochain = aVenir[0]
  if (evenements.length === 0) {
    phrases.push('Rien au programme aujourd’hui.')
  } else if (prochain) {
    phrases.push(`Prochain rendez-vous : ${prochain.titre} à ${formatHeure(prochain.debut_a)}.`)
  } else {
    phrases.push('Tous les rendez-vous du jour sont passés.')
  }

  const dues = taches.filter((t) => t.echeance && new Date(t.echeance) <= maintenant)
  if (dues.length === 1) {
    const premiere = dues[0]
    if (premiere) phrases.push(`Une chose à faire : ${premiere.titre.toLowerCase()}.`)
  } else if (dues.length > 1) {
    phrases.push(`${dues.length} choses à faire aujourd’hui.`)
  }

  return phrases.join(' ')
}

export function BriefGastif({ evenements, taches }: Props) {
  return (
    <div className="flex items-start gap-3 px-1">
      {/* La forme organique de Gastif — elle respire lentement, teinte or */}
      <svg width="28" height="28" viewBox="0 0 28 28" className="gastif-respire mt-0.5 shrink-0">
        <path
          d="M14 2.5c4.8 0 11 3.4 11 10.2 0 6.9-4.6 12.8-11 12.8S3 19.6 3 12.7C3 5.9 9.2 2.5 14 2.5Z"
          fill="var(--or)"
          opacity="0.9"
        />
      </svg>
      <p className="text-corps leading-snug text-encre-2">{composer(evenements, taches)}</p>
    </div>
  )
}
