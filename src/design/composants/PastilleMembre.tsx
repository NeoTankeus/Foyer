import type { LigneMembre } from '@/lib/basedonnees.types'
import { couleurMembre } from '@/lib/couleurs'

interface Props {
  membre: LigneMembre
  taille?: number
  estompee?: boolean
  onClick?: () => void
}

/** La pastille de couleur d'un membre — initiale sur fond de sa couleur. */
export function PastilleMembre({ membre, taille = 28, estompee = false, onClick }: Props) {
  const pastille = (
    <span
      aria-label={membre.prenom}
      className="flex items-center justify-center rounded-full font-[590] text-fond-eleve"
      style={{
        width: taille,
        height: taille,
        background: couleurMembre(membre.couleur),
        opacity: estompee ? 0.3 : 1,
        fontSize: taille * 0.45,
      }}
    >
      {membre.prenom.charAt(0).toUpperCase()}
    </span>
  )
  if (!onClick) return pastille
  return (
    <button
      onClick={onClick}
      aria-label={`Filtrer sur ${membre.prenom}`}
      aria-pressed={!estompee}
      className="flex min-h-sur-tactile min-w-sur-tactile items-center justify-center"
    >
      {pastille}
    </button>
  )
}
