// Tout est stocké en UTC, tout est affiché en Europe/Paris.
import { format, startOfDay, endOfDay, addDays, isSameDay, differenceInCalendarDays } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { fr } from 'date-fns/locale'

export const FUSEAU = 'Europe/Paris'

/** L'instant courant, projeté dans le fuseau du foyer. */
export function maintenantLocal(): Date {
  return toZonedTime(new Date(), FUSEAU)
}

/** Une date UTC (ISO) → Date locale Europe/Paris, pour affichage. */
export function versLocal(iso: string): Date {
  return toZonedTime(new Date(iso), FUSEAU)
}

/** Une Date « murale » Europe/Paris → ISO UTC, pour stockage. */
export function versUtc(dateLocale: Date): string {
  return fromZonedTime(dateLocale, FUSEAU).toISOString()
}

/** Bornes UTC de la journée locale courante (ou d'un jour donné). */
export function bornesJourneeLocale(jour?: Date): { debut: string; fin: string } {
  const base = jour ?? maintenantLocal()
  return {
    debut: fromZonedTime(startOfDay(base), FUSEAU).toISOString(),
    fin: fromZonedTime(endOfDay(base), FUSEAU).toISOString(),
  }
}

export function formatHeure(iso: string): string {
  return format(versLocal(iso), 'HH:mm', { locale: fr })
}

export function formatJourLong(date: Date): string {
  return format(date, 'EEEE d MMMM', { locale: fr })
}

export function formatJourCourt(date: Date): string {
  return format(date, 'EEE d', { locale: fr })
}

export function dateIsoJour(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export { addDays, isSameDay, differenceInCalendarDays }
