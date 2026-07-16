// Récurrences en RRULE (RFC 5545). Pas de bricolage maison.
// Import dynamique : la lib ne pèse pas sur le premier écran.

/** La prochaine occurrence STRICTEMENT après `apres`, ou null si la règle s'éteint. */
export async function prochaineOccurrence(regle: string, apres: Date): Promise<Date | null> {
  try {
    const { RRule } = await import('rrule')
    const options = RRule.parseString(regle.replace(/^RRULE:/, ''))
    const rrule = new RRule({ ...options, dtstart: apres })
    return rrule.after(apres, false)
  } catch {
    return null
  }
}

/** Les récurrences proposées dans l'interface (l'utilisateur ne voit jamais la syntaxe). */
export const RECURRENCES_PROPOSEES: { libelle: string; regle: string | null }[] = [
  { libelle: 'Une fois', regle: null },
  { libelle: 'Tous les jours', regle: 'FREQ=DAILY' },
  { libelle: 'Toutes les semaines', regle: 'FREQ=WEEKLY' },
  { libelle: 'Toutes les 2 semaines', regle: 'FREQ=WEEKLY;INTERVAL=2' },
  { libelle: 'Tous les mois', regle: 'FREQ=MONTHLY' },
]
