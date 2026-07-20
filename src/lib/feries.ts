// Jours fériés officiels (calendrier.api.gouv.fr, métropole) — cache 7 jours.
const CLE_CACHE = 'stg-feries'

export async function joursFeries(): Promise<Record<string, string>> {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a: number; feries: Record<string, string> } | null
    if (cache && Date.now() - cache.a < 7 * 24 * 3600 * 1000) return cache.feries
  } catch {
    // cache illisible
  }
  try {
    const r = await fetch('https://calendrier.api.gouv.fr/jours-feries/metropole.json')
    if (!r.ok) return {}
    const feries = (await r.json()) as Record<string, string>
    localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), feries }))
    return feries
  } catch {
    return {}
  }
}

/** Le prochain jour férié à venir (dans les 60 jours), ou null. */
export async function prochainFerie(): Promise<{ date: string; nom: string; dans: number } | null> {
  const feries = await joursFeries()
  const aujourdHui = new Date()
  aujourdHui.setHours(0, 0, 0, 0)
  const candidats = Object.entries(feries)
    .map(([date, nom]) => ({ date, nom, dans: Math.round((new Date(`${date}T12:00:00`).getTime() - aujourdHui.getTime()) / 86400000) }))
    .filter((f) => f.dans >= 0 && f.dans <= 60)
    .sort((a, b) => a.dans - b.dans)
  return candidats[0] ?? null
}
