// Tout est stocké en UTC, tout est affiché en Europe/Paris.
import { format, startOfDay, endOfDay, addDays, isSameDay, differenceInCalendarDays } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { fr } from 'date-fns/locale'

export const FUSEAU = 'Europe/Paris'

/** Le repli affiché quand la date manque ou est illisible. */
const DATE_INCONNUE = '—'

/**
 * `format()` de date-fns LÈVE une exception sur une date invalide, et
 * `.toISOString()` aussi : une seule colonne vide ou un import externe mal
 * formé suffisait à faire tomber l'écran entier. Tout passe désormais par
 * cette garde.
 */
export function dateValide(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime())
}

/** L'instant courant, projeté dans le fuseau du foyer. */
export function maintenantLocal(): Date {
  return toZonedTime(new Date(), FUSEAU)
}

/** Une date UTC (ISO) → Date locale Europe/Paris, pour affichage. */
export function versLocal(iso: string | null | undefined): Date {
  const brut = new Date(iso ?? NaN)
  // Date absente ou mal formée : on renvoie telle quelle une Date invalide,
  // que les formateurs ci-dessous savent rendre en repli lisible.
  if (!dateValide(brut)) return brut
  return toZonedTime(brut, FUSEAU)
}

/** Une Date « murale » Europe/Paris → ISO UTC, pour stockage. */
export function versUtc(dateLocale: Date): string {
  if (!dateValide(dateLocale)) return new Date().toISOString()
  return fromZonedTime(dateLocale, FUSEAU).toISOString()
}

/** Bornes UTC de la journée locale courante (ou d'un jour donné). */
export function bornesJourneeLocale(jour?: Date): { debut: string; fin: string } {
  const base = dateValide(jour) ? jour : maintenantLocal()
  return {
    debut: fromZonedTime(startOfDay(base), FUSEAU).toISOString(),
    fin: fromZonedTime(endOfDay(base), FUSEAU).toISOString(),
  }
}

export function formatHeure(iso: string | null | undefined): string {
  const d = versLocal(iso)
  return dateValide(d) ? format(d, 'HH:mm', { locale: fr }) : DATE_INCONNUE
}

export function formatJourLong(date: Date | null | undefined): string {
  return dateValide(date) ? format(date, 'EEEE d MMMM', { locale: fr }) : DATE_INCONNUE
}

export function formatJourCourt(date: Date | null | undefined): string {
  return dateValide(date) ? format(date, 'EEE d', { locale: fr }) : DATE_INCONNUE
}

export function dateIsoJour(date: Date | null | undefined): string {
  // Repli vide : cette valeur alimente des champs <input type="date">.
  return dateValide(date) ? format(date, 'yyyy-MM-dd') : ''
}

export { addDays, isSameDay, differenceInCalendarDays }
