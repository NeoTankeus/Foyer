// 🐸 Gérard, le compagnon du foyer : son humeur reflète l'état RÉEL de la
// maison — tâches en retard = il boude, tout est fait = il danse. Aucune IA,
// aucun réseau : Gérard est une grenouille de conviction, pas de calcul.
interface Props {
  retards: number
  aFaire: number
  nonLus: number
  courses: number
}

const varier = <T,>(liste: T[]): T => liste[new Date().getDate() % liste.length] as T

export function Gerard({ retards, aFaire, nonLus, courses }: Props) {
  let tete = '🐸'
  let humeur: string
  let phrase: string

  if (retards >= 3) {
    tete = '🐸💢'
    humeur = 'Gérard boude.'
    phrase = varier([
      `${retards} tâches en retard… Gérard a vu, Gérard juge.`,
      `Gérard s'est installé sur la pile des ${retards} trucs en retard. Il attend.`,
      `Gérard croasse de désapprobation (${retards} retards).`,
    ])
  } else if (retards > 0) {
    tete = '🐸😐'
    humeur = 'Gérard hausse un sourcil.'
    phrase = varier([
      `Il reste ${retards} retard${retards > 1 ? 's' : ''} — Gérard ne dit rien, mais Gérard n'en pense pas moins.`,
      `${retards} petite${retards > 1 ? 's' : ''} chose${retards > 1 ? 's' : ''} en retard. Gérard croit en vous.`,
    ])
  } else if (aFaire === 0 && courses === 0) {
    tete = '🐸✨'
    humeur = 'Gérard danse !'
    phrase = varier([
      'TOUT est fait. Gérard exécute la danse de la victoire sur son nénuphar.',
      'Rien à faire, rien à acheter. Gérard est fier au point d’en rosir (pour une grenouille, c’est beaucoup).',
      'Maison impeccable — Gérard vous nomme officiellement Foyer du Mois.',
    ])
  } else if (nonLus > 0) {
    tete = '🐸👀'
    humeur = 'Gérard a vu quelque chose.'
    phrase = `${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''} sur le Mur — Gérard sait ce qu'il y a écrit, mais Gérard est une tombe.`
  } else {
    tete = '🐸'
    humeur = 'Gérard est serein.'
    phrase = varier([
      `${aFaire} chose${aFaire > 1 ? 's' : ''} à faire, ${courses} course${courses > 1 ? 's' : ''} — une journée honnête. Gérard médite.`,
      'La maison ronronne. Gérard surveille une mouche, par principe.',
      'Tout roule. Gérard approuve d’un clignement d’œil lent.',
    ])
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-[40px] leading-none" aria-hidden="true">{tete}</span>
      <div className="min-w-0 flex-1">
        <p className="text-corps-2 font-[700] text-encre">{humeur}</p>
        <p className="text-corps-2 leading-snug text-encre-2">{phrase}</p>
      </div>
    </div>
  )
}
