// Météo du foyer — Open-Meteo (données des modèles nationaux dont
// Météo-France AROME/ARPEGE, gratuit, sans clé). Ville mémorisée par appareil.

export interface VilleMeteo {
  nom: string
  latitude: number
  longitude: number
}

export interface JourMeteo {
  date: string
  tMin: number
  tMax: number
  pluieMm: number
  probaPluie: number
  code: number
}

const CLE_VILLE = 'gastif-meteo-ville'
const CLE_CACHE = 'gastif-meteo-cache'

export function villeMeteo(): VilleMeteo | null {
  try {
    const brut = localStorage.getItem(CLE_VILLE)
    return brut ? (JSON.parse(brut) as VilleMeteo) : null
  } catch {
    return null
  }
}

export async function choisirVille(nom: string): Promise<VilleMeteo | null> {
  const reponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=1&language=fr&format=json`,
  )
  if (!reponse.ok) return null
  const donnees = (await reponse.json()) as {
    results?: { name: string; latitude: number; longitude: number }[]
  }
  const premier = donnees.results?.[0]
  if (!premier) return null
  const ville = { nom: premier.name, latitude: premier.latitude, longitude: premier.longitude }
  localStorage.setItem(CLE_VILLE, JSON.stringify(ville))
  localStorage.removeItem(CLE_CACHE)
  return ville
}

/** Prévisions 4 jours, cache 2 h. Modèle Météo-France via Open-Meteo. */
export async function previsions(): Promise<JourMeteo[]> {
  const ville = villeMeteo()
  if (!ville) return []
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a: number; jours: JourMeteo[] } | null
    if (cache && Date.now() - cache.a < 2 * 3600 * 1000) return cache.jours
  } catch {
    // cache illisible
  }
  const reponse = await fetch(
    `https://api.open-meteo.com/v1/meteofrance?latitude=${ville.latitude}&longitude=${ville.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code` +
      `&timezone=Europe%2FParis&forecast_days=4`,
  )
  if (!reponse.ok) return []
  const donnees = (await reponse.json()) as {
    daily?: {
      time: string[]
      temperature_2m_min: number[]
      temperature_2m_max: number[]
      precipitation_sum: number[]
      precipitation_probability_max: (number | null)[]
      weather_code: number[]
    }
  }
  const d = donnees.daily
  if (!d) return []
  const jours = d.time.map((date, i) => ({
    date,
    tMin: Math.round(d.temperature_2m_min[i] ?? 0),
    tMax: Math.round(d.temperature_2m_max[i] ?? 0),
    pluieMm: d.precipitation_sum[i] ?? 0,
    probaPluie: d.precipitation_probability_max[i] ?? 0,
    code: d.weather_code[i] ?? 0,
  }))
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), jours }))
  } catch {
    // pas grave
  }
  return jours
}

export function iconeMeteo(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫'
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧'
  if (code <= 77 || (code >= 85 && code <= 86)) return '❄️'
  if (code >= 95) return '⛈'
  return '🌥'
}
