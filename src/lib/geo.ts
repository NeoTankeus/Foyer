// 📍 Retrouver un lieu sur la carte — UNE seule fois pour toute l'application.
//
// Pourquoi ce fichier existe : chaque écran interrogeait le géocodeur avec
// `count=1`, c'est-à-dire « donne-moi le résultat le plus PEUPLÉ au monde ».
// Résultat, « Marcellus » (Lot-et-Garonne, 1 400 habitants) revenait comme
// Marcellus dans l'État de New York — et le calcul d'itinéraire échouait avec
// un message incompréhensible (« Origin and destination have different
// ProductId's », autrement dit : ces deux points ne sont pas sur le même
// continent).
//
// Ici on demande PLUSIEURS résultats et on privilégie la France, puis le plus
// proche de la maison. Et on garde le pays sous la main, pour pouvoir le dire.

export interface LieuTrouve {
  /** Le nom retenu, tel qu'il faut l'afficher (« Marcellus, Nouvelle-Aquitaine »). */
  nom: string
  /** Le nom brut de la commune, sans la région. */
  commune: string
  lat: number
  lon: number
  pays: string
  paysCode: string
  region: string
}

interface Brut {
  name?: unknown
  latitude?: unknown
  longitude?: unknown
  country?: unknown
  country_code?: unknown
  admin1?: unknown
}

/** Distance approximative en kilomètres — largement suffisante pour trancher. */
export function kmEntre(laA: number, loA: number, laB: number, loB: number): number {
  const dLat = (laA - laB) * 111.32
  const dLon = (loA - loB) * 111.32 * Math.cos((laA * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

const enLieu = (b: Brut, replis: string): LieuTrouve | null => {
  const lat = Number(b.latitude)
  const lon = Number(b.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const commune = String(b.name ?? replis).trim() || replis
  const region = typeof b.admin1 === 'string' ? b.admin1 : ''
  const pays = typeof b.country === 'string' ? b.country : ''
  const paysCode = typeof b.country_code === 'string' ? b.country_code : ''
  // Le nom affiché porte la région (et le pays s'il est étranger) : on voit
  // tout de suite si l'app a choisi le bon endroit.
  const precision = paysCode === 'FR' ? region : [region, pays].filter(Boolean).join(', ')
  return {
    nom: precision ? `${commune} (${precision})` : commune,
    commune,
    lat,
    lon,
    pays,
    paysCode,
    region,
  }
}

/** Tous les lieux correspondant à une saisie, dans l'ordre du géocodeur. */
export async function candidatsLieu(nom: string, combien = 8): Promise<LieuTrouve[]> {
  const requete = String(nom ?? '').trim()
  if (requete.length < 2) return []
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(requete)}` +
        `&count=${Math.min(Math.max(combien, 1), 20)}&language=fr&format=json`,
      { signal: AbortSignal.timeout(10000) },
    )
    if (!r.ok) return []
    const d = (await r.json().catch(() => null)) as { results?: Brut[] } | null
    return (Array.isArray(d?.results) ? d.results : [])
      .map((b) => enLieu(b, requete))
      .filter((l): l is LieuTrouve => l !== null)
  } catch {
    return []
  }
}

/**
 * LE lieu le plus probable pour une saisie française.
 * Ordre de préférence : en France ET le plus proche de la maison → en France →
 * le plus proche de la maison → le premier venu.
 */
export async function trouverLieu(
  nom: string,
  depuis?: { lat: number; lon: number } | null,
): Promise<LieuTrouve | null> {
  const candidats = await candidatsLieu(nom, 10)
  if (candidats.length === 0) return null
  const francais = candidats.filter((c) => c.paysCode === 'FR')
  const pool = francais.length > 0 ? francais : candidats
  if (!depuis || !Number.isFinite(depuis.lat) || !Number.isFinite(depuis.lon)) return pool[0] ?? null
  // À égalité de pays, on prend le plus proche de chez nous : c'est presque
  // toujours celui qu'on avait en tête.
  return (
    [...pool].sort(
      (a, b) => kmEntre(depuis.lat, depuis.lon, a.lat, a.lon) - kmEntre(depuis.lat, depuis.lon, b.lat, b.lon),
    )[0] ?? null
  )
}

/**
 * Un lieu trouvé à l'autre bout du monde est presque toujours une erreur de
 * géocodage — on le signale au lieu de laisser le calcul échouer en charabia.
 */
export function alerteLieuLointain(
  lieu: LieuTrouve,
  depuis: { lat: number; lon: number } | null | undefined,
  limiteKm = 1500,
): string | null {
  if (!depuis || !Number.isFinite(depuis.lat) || !Number.isFinite(depuis.lon)) return null
  const km = Math.round(kmEntre(depuis.lat, depuis.lon, lieu.lat, lieu.lon))
  if (km <= limiteKm) return null
  return (
    `⚠️ « ${lieu.commune} » a été trouvé ${lieu.pays && lieu.paysCode !== 'FR' ? `en ${lieu.pays}` : 'très loin'}, ` +
    `à ${km.toLocaleString('fr-FR')} km de la maison. Si ce n’est pas le bon endroit, précise la destination ` +
    `(par exemple « ${lieu.commune}, Lot-et-Garonne »).`
  )
}
