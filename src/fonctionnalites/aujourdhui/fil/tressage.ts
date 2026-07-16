// Le moteur du Fil : une passe de layout pure.
// Entrée : les membres et les événements de la journée.
// Sortie : une courbe par membre (les fils), les perles, l'axe du temps.
//
// Les fils courent en parallèle quand chacun vaque de son côté ; ils convergent
// et se tressent quand des membres partagent un événement. Un trou de garde
// (les adultes ailleurs, l'enfant seul) s'écarte de lui-même : aucun code
// d'alerte, la géométrie suffit.

import type { CouleurMembre, LigneEvenement } from '@/lib/basedonnees.types'
import { versLocal } from '@/lib/dates'

export interface MembreFil {
  id: string
  couleur: CouleurMembre
  prenom: string
}

export interface EntreeTressage {
  membres: MembreFil[]
  evenements: LigneEvenement[]
  largeur: number
  hauteur: number
  heureDebut?: number
  heureFin?: number
}

export interface PerleFil {
  evenement: LigneEvenement
  x: number
  y: number
  partagee: boolean
  couleur: CouleurMembre | null
}

export interface CheminFil {
  membreId: string
  couleur: CouleurMembre
  d: string
}

export interface SortieTressage {
  chemins: CheminFil[]
  perles: PerleFil[]
  journeesEntieres: LigneEvenement[]
  yPourHeure: (heure: number) => number
}

const TRANSITION_HEURES = 0.45 // durée de convergence vers la tresse
const PERIODE_TRESSE = 0.5 // un croisement toutes les 30 min
const AMPLITUDE_TRESSE = 6 // écart latéral du tressage, en px
const MARGE_HAUTE = 18
const MARGE_BASSE = 18
const MARGE_LATERALE = 56 // laisse la place aux heures à gauche

interface ImageCle {
  h: number
  x: number
}

function heureDecimale(iso: string): number {
  const locale = versLocal(iso)
  return locale.getHours() + locale.getMinutes() / 60
}

/** Participants effectifs d'un événement : vide = tout le foyer. */
function participantsEffectifs(evenement: LigneEvenement, membres: MembreFil[]): string[] {
  const ids = membres.map((m) => m.id)
  if (evenement.participants.length === 0) return ids
  return evenement.participants.filter((p) => ids.includes(p))
}

export function tresser(entree: EntreeTressage): SortieTressage {
  const { membres, largeur, hauteur } = entree
  const heureDebut = entree.heureDebut ?? 6
  const heureFin = entree.heureFin ?? 22

  const yPourHeure = (heure: number): number => {
    const bornee = Math.min(Math.max(heure, heureDebut), heureFin)
    return (
      MARGE_HAUTE +
      ((bornee - heureDebut) / (heureFin - heureDebut)) * (hauteur - MARGE_HAUTE - MARGE_BASSE)
    )
  }

  const journeesEntieres = entree.evenements.filter((e) => e.journee_entiere)
  const horaires = entree.evenements
    .filter((e) => !e.journee_entiere)
    .sort((a, b) => a.debut_a.localeCompare(b.debut_a))

  // Voie de base de chaque membre, répartie sur la largeur utile.
  const largeurUtile = largeur - MARGE_LATERALE - 24
  const voieDeBase = new Map<string, number>()
  membres.forEach((membre, index) => {
    const x =
      membres.length === 1
        ? MARGE_LATERALE + largeurUtile / 2
        : MARGE_LATERALE + (index / (membres.length - 1)) * largeurUtile
    voieDeBase.set(membre.id, x)
  })

  // Images clés par membre : la voie de base, déviée pendant les événements partagés.
  const images = new Map<string, ImageCle[]>()
  for (const membre of membres) {
    const x = voieDeBase.get(membre.id) ?? MARGE_LATERALE
    images.set(membre.id, [
      { h: heureDebut, x },
      { h: heureFin, x },
    ])
  }

  const perles: PerleFil[] = []

  for (const evenement of horaires) {
    const participants = participantsEffectifs(evenement, membres)
    const hDebut = Math.max(heureDecimale(evenement.debut_a), heureDebut)
    const hFin = Math.min(heureDecimale(evenement.fin_a), heureFin)
    if (hFin <= hDebut) continue

    if (participants.length <= 1) {
      // Événement solo : une perle sur la voie du membre, la voie ne bouge pas.
      const membreId = participants[0]
      const membre = membres.find((m) => m.id === membreId)
      if (!membre) continue
      perles.push({
        evenement,
        x: voieDeBase.get(membre.id) ?? MARGE_LATERALE,
        y: yPourHeure(hDebut),
        partagee: false,
        couleur: membre.couleur,
      })
      continue
    }

    // Événement partagé : les voies convergent vers leur centre et se tressent.
    const centre =
      participants.reduce((somme, id) => somme + (voieDeBase.get(id) ?? 0), 0) /
      participants.length

    participants.forEach((membreId, rang) => {
      const cles = images.get(membreId)
      const base = voieDeBase.get(membreId)
      if (!cles || base === undefined) return

      cles.push({ h: Math.max(hDebut - TRANSITION_HEURES, heureDebut), x: base })
      // Le tressage : une oscillation autour du centre, en opposition de phase
      // selon le rang du membre — les fils se croisent.
      let signe = rang % 2 === 0 ? 1 : -1
      for (let h = hDebut; h < hFin; h += PERIODE_TRESSE) {
        cles.push({ h, x: centre + signe * AMPLITUDE_TRESSE })
        signe = -signe
      }
      cles.push({ h: hFin, x: centre + signe * AMPLITUDE_TRESSE })
      cles.push({ h: Math.min(hFin + TRANSITION_HEURES, heureFin), x: base })
    })

    perles.push({
      evenement,
      x: centre,
      y: yPourHeure(hDebut),
      partagee: true,
      couleur: null,
    })
  }

  // Courbes de Bézier verticales entre images clés.
  const chemins: CheminFil[] = membres.map((membre) => {
    const cles = (images.get(membre.id) ?? [])
      .slice()
      .sort((a, b) => a.h - b.h)
    let d = ''
    cles.forEach((cle, index) => {
      const y = yPourHeure(cle.h)
      if (index === 0) {
        d = `M ${cle.x.toFixed(1)} ${y.toFixed(1)}`
        return
      }
      const precedente = cles[index - 1]
      if (!precedente) return
      const yPrecedent = yPourHeure(precedente.h)
      const yMilieu = (y + yPrecedent) / 2
      d += ` C ${precedente.x.toFixed(1)} ${yMilieu.toFixed(1)}, ${cle.x.toFixed(1)} ${yMilieu.toFixed(1)}, ${cle.x.toFixed(1)} ${y.toFixed(1)}`
    })
    return { membreId: membre.id, couleur: membre.couleur, d }
  })

  return { chemins, perles, journeesEntieres, yPourHeure }
}
