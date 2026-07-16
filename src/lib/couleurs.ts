import type { CouleurMembre } from './basedonnees.types'

/** Valeur CSS de la couleur d'un membre. */
export function couleurMembre(couleur: CouleurMembre): string {
  return `var(--${couleur})`
}
