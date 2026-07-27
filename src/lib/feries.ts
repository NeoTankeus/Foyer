// Jours fériés officiels (calendrier.api.gouv.fr, métropole) — cache 7 jours.
const CLE_CACHE = 'stg-feries'

export async function joursFeries(): Promise<Record<string, string>> {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a?: number; feries?: Record<string, string> } | null
    const memo = cache?.feries
    if (memo && typeof memo === 'object' && !Array.isArray(memo) && Date.now() - Number(cache?.a ?? 0) < 7 * 24 * 3600 * 1000) {
      return memo
    }
  } catch {
    // cache illisible
  }
  try {
    const r = await fetch('https://calendrier.api.gouv.fr/jours-feries/metropole.json', {
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return {}
    // Le service peut renvoyer autre chose qu'un dictionnaire (page d'erreur
    // au format JSON, null…) : sans cette garde, Object.entries plante.
    const brut = (await r.json()) as unknown
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {}
    const feries = brut as Record<string, string>
    // Un quota de stockage plein ne doit pas faire perdre les données déjà obtenues.
    try {
      localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), feries }))
    } catch {
      // tant pis pour le cache
    }
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
    .map(([date, nom]) => ({
      date,
      nom: String(nom ?? ''),
      dans: Math.round((new Date(`${date}T12:00:00`).getTime() - aujourdHui.getTime()) / 86400000),
    }))
    .filter((f) => Number.isFinite(f.dans) && f.dans >= 0 && f.dans <= 60)
    .sort((a, b) => a.dans - b.dans)
  return candidats[0] ?? null
}
