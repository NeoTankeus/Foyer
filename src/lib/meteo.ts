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
    if (!brut) return null
    // Le contenu du stockage local peut être corrompu ou d'une ancienne
    // version : on ne le croit que s'il a bien la forme attendue.
    const v = JSON.parse(brut) as unknown
    if (!v || typeof v !== 'object') return null
    const { nom, latitude, longitude } = v as Partial<VilleMeteo>
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { nom: String(nom ?? ''), latitude: latitude as number, longitude: longitude as number }
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
  const premier = Array.isArray(donnees.results) ? donnees.results[0] : undefined
  if (!premier || !Number.isFinite(premier.latitude) || !Number.isFinite(premier.longitude)) return null
  const ville = { nom: String(premier.name ?? nom), latitude: premier.latitude, longitude: premier.longitude }
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
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a?: number; jours?: JourMeteo[] } | null
    if (cache && Array.isArray(cache.jours) && Date.now() - Number(cache.a ?? 0) < 2 * 3600 * 1000) return cache.jours
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
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_HEURES) ?? 'null') as { a?: number; heures?: HeureMeteo[] } | null
    if (cache && Array.isArray(cache.heures) && Date.now() - Number(cache.a ?? 0) < 2 * 3600 * 1000) return cache.heures
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
      time?: string[]
      temperature_2m?: (number | null)[]
      precipitation?: (number | null)[]
      weather_code?: (number | null)[]
      wind_speed_10m?: (number | null)[]
      wind_gusts_10m?: (number | null)[]
      wind_direction_10m?: (number | null)[]
    }
  }
  const h = donnees.hourly
  if (!h || !Array.isArray(h.time)) return []
  // Chaque série peut manquer si le modèle n'a pas la variable : on lit dans
  // un tableau vide plutôt que de planter sur `undefined[i]`.
  const serieH = (v: (number | null)[] | undefined): (number | null)[] => (Array.isArray(v) ? v : [])
  const heures = h.time.map((quand, i) => ({
    quand: String(quand ?? ''),
    t: Math.round(serieH(h.temperature_2m)[i] ?? 0),
    pluie: serieH(h.precipitation)[i] ?? 0,
    code: serieH(h.weather_code)[i] ?? 0,
    vent: Math.round(serieH(h.wind_speed_10m)[i] ?? 0),
    rafales: Math.round(serieH(h.wind_gusts_10m)[i] ?? 0),
    direction: serieH(h.wind_direction_10m)[i] ?? 0,
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
    const brut = JSON.parse(localStorage.getItem(CLE_CACHE_ARCHIVE) ?? '{}') as unknown
    if (brut && typeof brut === 'object' && !Array.isArray(brut)) cache = brut as typeof cache
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
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_MER) ?? 'null') as { a?: number; mer?: MerHeure[] } | null
    if (cache && Array.isArray(cache.mer) && Date.now() - Number(cache.a ?? 0) < 2 * 3600 * 1000) return cache.mer
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
        time?: string[]
        wave_height?: (number | null)[]
        wave_period?: (number | null)[]
        sea_surface_temperature?: (number | null)[]
      }
    }
    const h = donnees.hourly
    if (!h || !Array.isArray(h.time)) return []
    const serieM = (v: (number | null)[] | undefined): (number | null)[] => (Array.isArray(v) ? v : [])
    const mer = h.time.map((quand, i) => ({
      quand: String(quand ?? ''),
      vagues: serieM(h.wave_height)[i] ?? null,
      periode: serieM(h.wave_period)[i] ?? null,
      eau: serieM(h.sea_surface_temperature)[i] ?? null,
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

// ——————————————————— La fiche météo DÉTAILLÉE, pour n'importe où ———————————————————
//
// Les fonctions ci-dessus travaillent sur LA ville mémorisée de l'appareil.
// Celles qui suivent acceptent un lieu quelconque (destination d'un voyage,
// ville cherchée à la volée) et rendent tout ce qu'on peut savoir : le jour
// par jour ET l'heure par heure, façon Windfinder.

export interface Lieu {
  nom: string
  latitude: number
  longitude: number
}

/** Une heure, avec TOUT ce qu'Open-Meteo sait en donner. */
export interface HeureDetaillee extends HeureMeteo {
  ressenti: number
  probaPluie: number
  humidite: number
  pression: number
  nuages: number
  jour: boolean
}

export interface MeteoComplete {
  jours: JourMeteo[]
  heures: HeureDetaillee[]
  mer: MerHeure[]
}

/** Jusqu'à 6 communes correspondant à une saisie — sans rien mémoriser. */
export async function chercherVilles(nom: string): Promise<Lieu[]> {
  const requete = nom.trim()
  if (requete.length < 2) return []
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(requete)}&count=6&language=fr&format=json`,
    )
    if (!r.ok) return []
    const d = (await r.json()) as {
      results?: { name?: string; latitude?: number; longitude?: number; admin1?: string; country?: string; country_code?: string }[]
    }
    return (Array.isArray(d.results) ? d.results : [])
      .filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
      .map((v) => ({
        // Le nom porte la région (et le pays s'il est étranger) : deux
        // communes homonymes ne se ressemblent plus.
        nom: [v.name ?? requete, v.admin1, v.country_code === 'FR' ? null : v.country].filter(Boolean).join(', '),
        latitude: v.latitude as number,
        longitude: v.longitude as number,
      }))
  } catch {
    return []
  }
}

const CLE_CACHE_FICHE = 'stg-meteo-fiche'

/** Le cache est rangé par lieu ARRONDI : deux points voisins partagent tout. */
const cleLieu = (lieu: Lieu, jours: number) =>
  `${lieu.latitude.toFixed(2)},${lieu.longitude.toFixed(2)},${jours}`

/**
 * TOUT ce qu'on peut prévoir pour un lieu : jour par jour et heure par heure
 * (température, ressenti, pluie, vent, rafales, direction, humidité, nuages,
 * pression) plus l'état de la mer quand on est près des côtes. Cache 1 h.
 */
export async function meteoComplete(lieu: Lieu, jours = 7): Promise<MeteoComplete> {
  const vide: MeteoComplete = { jours: [], heures: [], mer: [] }
  if (!Number.isFinite(lieu.latitude) || !Number.isFinite(lieu.longitude)) return vide
  const cle = cleLieu(lieu, jours)
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_FICHE) ?? 'null') as
      | Record<string, { a?: number; v?: MeteoComplete }>
      | null
    const connu = cache?.[cle]
    if (connu?.v && Date.now() - Number(connu.a ?? 0) < 3600 * 1000) return connu.v
  } catch {
    // cache illisible : on recharge
  }

  const forecast = fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,weather_code,uv_index_max,sunrise,sunset` +
      `&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,` +
      `wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,cloud_cover,is_day` +
      `&timezone=auto&forecast_days=${jours}`,
  ).then((r) => (r.ok ? r.json() : null)).catch(() => null)

  // La mer n'existe pas partout : son échec ne doit rien empêcher.
  const marine = fetch(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lieu.latitude}&longitude=${lieu.longitude}` +
      `&hourly=wave_height,wave_period,sea_surface_temperature&timezone=auto&forecast_days=${jours}`,
  ).then((r) => (r.ok ? r.json() : null)).catch(() => null)

  const [brutForecast, brutMarine] = await Promise.all([forecast, marine])

  const nb = (v: unknown, defaut = 0): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : defaut
  }
  const serie = (source: unknown, nom: string): unknown[] => {
    const bloc = (source as Record<string, unknown> | null)?.[nom]
    return Array.isArray(bloc) ? bloc : []
  }

  const q = (brutForecast as { daily?: unknown; hourly?: unknown } | null) ?? {}
  const dates = serie(q.daily, 'time') as string[]
  const joursLus: JourMeteo[] = dates.map((date, i) => ({
    date: String(date ?? ''),
    tMin: Math.round(nb(serie(q.daily, 'temperature_2m_min')[i])),
    tMax: Math.round(nb(serie(q.daily, 'temperature_2m_max')[i])),
    pluieMm: nb(serie(q.daily, 'precipitation_sum')[i]),
    probaPluie: Math.round(nb(serie(q.daily, 'precipitation_probability_max')[i])),
    code: Math.round(nb(serie(q.daily, 'weather_code')[i])),
    uvMax: Math.round(nb(serie(q.daily, 'uv_index_max')[i])),
    lever: String(serie(q.daily, 'sunrise')[i] ?? '').slice(11, 16),
    coucher: String(serie(q.daily, 'sunset')[i] ?? '').slice(11, 16),
  }))

  const quands = serie(q.hourly, 'time') as string[]
  const heuresLues: HeureDetaillee[] = quands.map((quand, i) => ({
    quand: String(quand ?? ''),
    t: Math.round(nb(serie(q.hourly, 'temperature_2m')[i])),
    ressenti: Math.round(nb(serie(q.hourly, 'apparent_temperature')[i])),
    pluie: nb(serie(q.hourly, 'precipitation')[i]),
    probaPluie: Math.round(nb(serie(q.hourly, 'precipitation_probability')[i])),
    code: Math.round(nb(serie(q.hourly, 'weather_code')[i])),
    vent: Math.round(nb(serie(q.hourly, 'wind_speed_10m')[i])),
    rafales: Math.round(nb(serie(q.hourly, 'wind_gusts_10m')[i])),
    direction: Math.round(nb(serie(q.hourly, 'wind_direction_10m')[i])),
    humidite: Math.round(nb(serie(q.hourly, 'relative_humidity_2m')[i])),
    pression: Math.round(nb(serie(q.hourly, 'pressure_msl')[i])),
    nuages: Math.round(nb(serie(q.hourly, 'cloud_cover')[i])),
    jour: nb(serie(q.hourly, 'is_day')[i], 1) === 1,
  }))

  const m = (brutMarine as { hourly?: unknown } | null) ?? {}
  const quandsMer = serie(m.hourly, 'time') as string[]
  const merLue: MerHeure[] = quandsMer.map((quand, i) => {
    const h = serie(m.hourly, 'wave_height')[i]
    const p = serie(m.hourly, 'wave_period')[i]
    const e = serie(m.hourly, 'sea_surface_temperature')[i]
    return {
      quand: String(quand ?? ''),
      vagues: h === null || h === undefined ? null : nb(h),
      periode: p === null || p === undefined ? null : nb(p),
      eau: e === null || e === undefined ? null : nb(e),
    }
  })

  const resultat: MeteoComplete = { jours: joursLus, heures: heuresLues, mer: merLue }
  if (joursLus.length === 0 && heuresLues.length === 0) return vide
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE_FICHE) ?? '{}') as Record<string, unknown>
    // On ne garde que les 6 derniers lieux consultés : le stockage est petit.
    const entrees = Object.entries(cache).slice(-5)
    localStorage.setItem(CLE_CACHE_FICHE, JSON.stringify({ ...Object.fromEntries(entrees), [cle]: { a: Date.now(), v: resultat } }))
  } catch {
    // stockage plein : tant pis, on rechargera
  }
  return resultat
}
