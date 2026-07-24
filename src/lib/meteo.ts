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
  uvMax: number
  lever: string // hh:mm
  coucher: string // hh:mm
}

// Une heure de mer (côtes uniquement — nul dans les terres).
export interface MerHeure {
  quand: string
  vagues: number | null // m
  periode: number | null // s
  eau: number | null // °C
}

// Une heure de prévision, façon Windfinder : vent, rafales, direction.
export interface HeureMeteo {
  quand: string // AAAA-MM-JJThh:00
  t: number
  pluie: number
  code: number
  vent: number // km/h
  rafales: number // km/h
  direction: number // degrés (d'où vient le vent)
}

const CLE_VILLE = 'gastif-meteo-ville'
// v3 : consensus deux-modèles + UV + lever/coucher du soleil.
const CLE_CACHE = 'gastif-meteo-cache-v3'

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

/**
 * Prévisions 4 jours, cache 2 h — CONSENSUS de deux modèles (Météo-France +
 * le meilleur modèle local d'Open-Meteo). Un seul modèle annonce parfois des
 * averses fantômes : la pluie n'est affichée que si les DEUX sont d'accord ;
 * sinon, c'est un simple « risque ».
 */
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
    `https://api.open-meteo.com/v1/forecast?latitude=${ville.latitude}&longitude=${ville.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code,uv_index_max,sunrise,sunset` +
      `&timezone=Europe%2FParis&forecast_days=4&models=meteofrance_seamless,best_match`,
  )
  if (!reponse.ok) return []
  const donnees = (await reponse.json()) as { daily?: Record<string, (number | null)[] | string[]> }
  const d = donnees.daily
  if (!d || !Array.isArray(d['time'])) return []

  // Avec plusieurs modèles, chaque série revient suffixée du nom du modèle.
  const serie = (nom: string, modele: string): (number | null)[] =>
    ((d[`${nom}_${modele}`] ?? d[nom] ?? []) as (number | null)[])
  const mf = (nom: string, i: number) => serie(nom, 'meteofrance_seamless')[i] ?? null
  const bm = (nom: string, i: number) => serie(nom, 'best_match')[i] ?? null
  // Les heures (lever/coucher) arrivent en chaînes, suffixées elles aussi.
  const chaine = (nom: string, i: number): string =>
    String((d[`${nom}_meteofrance_seamless`] ?? d[`${nom}_best_match`] ?? d[nom] ?? [])[i] ?? '')

  const jours = (d['time'] as string[]).map((date, i) => {
    const mmMf = mf('precipitation_sum', i) ?? 0
    const mmBm = bm('precipitation_sum', i) ?? mmMf
    const mmMin = Math.min(mmMf, mmBm)
    const mmMax = Math.max(mmMf, mmBm)
    const probaFournie = Math.max(mf('precipitation_probability_max', i) ?? 0, bm('precipitation_probability_max', i) ?? 0)

    let pluieMm: number
    let probaPluie: number
    if (mmMin >= 0.5) {
      // Les deux modèles voient de la pluie : on l'annonce franchement.
      pluieMm = (mmMf + mmBm) / 2
      probaPluie = Math.max(probaFournie, pluieMm >= 5 ? 85 : 60)
    } else if (mmMax >= 1) {
      // Un seul modèle voit de la pluie : simple RISQUE, pas d'averse fantôme.
      pluieMm = 0
      probaPluie = Math.max(30, Math.min(probaFournie, 49))
    } else {
      pluieMm = 0
      probaPluie = probaFournie
    }

    // Le pictogramme suit le consensus : temps sec → le code du modèle le
    // plus sec (pas de nuage d'orage si on annonce « pas de pluie »).
    const codeMf = mf('weather_code', i) ?? 0
    const codeBm = bm('weather_code', i) ?? codeMf
    const code = mmMin >= 0.5 ? Math.max(codeMf, codeBm) : mmMf <= mmBm ? codeMf : codeBm

    return {
      date,
      tMin: Math.round(((mf('temperature_2m_min', i) ?? 0) + (bm('temperature_2m_min', i) ?? mf('temperature_2m_min', i) ?? 0)) / 2),
      tMax: Math.round(((mf('temperature_2m_max', i) ?? 0) + (bm('temperature_2m_max', i) ?? mf('temperature_2m_max', i) ?? 0)) / 2),
      pluieMm,
      probaPluie,
      code,
      uvMax: Math.round(Math.max(mf('uv_index_max', i) ?? 0, bm('uv_index_max', i) ?? 0)),
      lever: chaine('sunrise', i).slice(11, 16),
      coucher: chaine('sunset', i).slice(11, 16),
    }
  })
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), jours }))
  } catch {
    // pas grave
  }
  return jours
}

const CLE_CACHE_HEURES = 'stg-meteo-heures'

/** Prévisions HEURE PAR HEURE sur 4 jours (vent compris), cache 2 h. */
export async function previsionsHoraires(): Promise<HeureMeteo[]> {
  const ville = villeMeteo()
  if (!ville) return []
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_HEURES) ?? 'null') as { a: number; heures: HeureMeteo[] } | null
    if (cache && Date.now() - cache.a < 2 * 3600 * 1000) return cache.heures
  } catch {
    // cache illisible
  }
  const reponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${ville.latitude}&longitude=${ville.longitude}` +
      `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m` +
      `&timezone=Europe%2FParis&forecast_days=4`,
  )
  if (!reponse.ok) return []
  const donnees = (await reponse.json()) as {
    hourly?: {
      time: string[]
      temperature_2m: (number | null)[]
      precipitation: (number | null)[]
      weather_code: (number | null)[]
      wind_speed_10m: (number | null)[]
      wind_gusts_10m: (number | null)[]
      wind_direction_10m: (number | null)[]
    }
  }
  const h = donnees.hourly
  if (!h) return []
  const heures = h.time.map((quand, i) => ({
    quand,
    t: Math.round(h.temperature_2m[i] ?? 0),
    pluie: h.precipitation[i] ?? 0,
    code: h.weather_code[i] ?? 0,
    vent: Math.round(h.wind_speed_10m[i] ?? 0),
    rafales: Math.round(h.wind_gusts_10m[i] ?? 0),
    direction: h.wind_direction_10m[i] ?? 0,
  }))
  try {
    localStorage.setItem(CLE_CACHE_HEURES, JSON.stringify({ a: Date.now(), heures }))
  } catch {
    // pas grave
  }
  return heures
}

const CLE_CACHE_ARCHIVE = 'stg-meteo-archive'

/**
 * La météo d'un jour PASSÉ (archives Open-Meteo, sans clé) — pour la capsule
 * souvenir « il y a un an, il faisait 34° ». Cache définitif par date.
 */
export async function meteoDuJourPasse(date: string): Promise<{ tMax: number; code: number } | null> {
  const ville = villeMeteo()
  if (!ville || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  let cache: Record<string, { tMax: number; code: number }> = {}
  try {
    cache = JSON.parse(localStorage.getItem(CLE_CACHE_ARCHIVE) ?? '{}') as typeof cache
    const connu = cache[date]
    if (connu) return connu
  } catch {
    // cache illisible
  }
  try {
    const r = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${ville.latitude}&longitude=${ville.longitude}` +
        `&start_date=${date}&end_date=${date}&daily=temperature_2m_max,weather_code&timezone=Europe%2FParis`,
    )
    if (!r.ok) return null
    const d = (await r.json()) as { daily?: { temperature_2m_max?: (number | null)[]; weather_code?: (number | null)[] } }
    const tMax = d.daily?.temperature_2m_max?.[0]
    if (tMax === null || tMax === undefined) return null
    const valeur = { tMax: Math.round(tMax), code: d.daily?.weather_code?.[0] ?? 0 }
    // Le passé ne change plus : cache définitif, borné aux 40 dates récentes.
    const entrees = [...Object.entries(cache), [date, valeur] as const].slice(-40)
    try {
      localStorage.setItem(CLE_CACHE_ARCHIVE, JSON.stringify(Object.fromEntries(entrees)))
    } catch {
      // pas grave
    }
    return valeur
  } catch {
    return null
  }
}

const CLE_CACHE_MER = 'stg-meteo-mer'

/**
 * L'état de la MER heure par heure (vagues, période de houle, température de
 * l'eau) — API marine d'Open-Meteo, pertinente près des côtes (vide dans les
 * terres). Cache 2 h.
 */
export async function previsionsMarines(): Promise<MerHeure[]> {
  const ville = villeMeteo()
  if (!ville) return []
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_MER) ?? 'null') as { a: number; mer: MerHeure[] } | null
    if (cache && Date.now() - cache.a < 2 * 3600 * 1000) return cache.mer
  } catch {
    // cache illisible
  }
  try {
    const reponse = await fetch(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${ville.latitude}&longitude=${ville.longitude}` +
        `&hourly=wave_height,wave_period,sea_surface_temperature&timezone=Europe%2FParis&forecast_days=4`,
    )
    if (!reponse.ok) return []
    const donnees = (await reponse.json()) as {
      hourly?: {
        time: string[]
        wave_height: (number | null)[]
        wave_period: (number | null)[]
        sea_surface_temperature: (number | null)[]
      }
    }
    const h = donnees.hourly
    if (!h) return []
    const mer = h.time.map((quand, i) => ({
      quand,
      vagues: h.wave_height[i] ?? null,
      periode: h.wave_period[i] ?? null,
      eau: h.sea_surface_temperature[i] ?? null,
    }))
    try {
      localStorage.setItem(CLE_CACHE_MER, JSON.stringify({ a: Date.now(), mer }))
    } catch {
      // pas grave
    }
    return mer
  } catch {
    // loin de la mer ou service indisponible : pas de section Mer, c'est tout
    return []
  }
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
