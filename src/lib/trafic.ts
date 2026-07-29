// 🚨 Le trafic autour de nous : position de l'appareil + incidents en direct.
//
// Ce que l'app fait vraiment, et ce qu'elle ne peut PAS faire :
//  • la position vient du téléphone, et UNIQUEMENT quand on l'autorise ;
//  • iOS n'autorise aucune application web à se géolocaliser en arrière-plan.
//    On mémorise donc la DERNIÈRE position connue (à chaque ouverture de
//    l'app), et c'est elle qui sert aux alertes envoyées plus tard ;
//  • la source des incidents est le flux temps réel de TomTom — celui que
//    lisent les applis de navigation, alimenté par les exploitants routiers,
//    les forces de l'ordre et les véhicules connectés. La radio FM (107.7 et
//    les décrochages locaux) n'a aucun flux de données public : elle n'est
//    pas branchable, contrairement à ce qu'on pourrait croire.
import { supabase } from './supabase'

export interface PositionConnue {
  lat: number
  lon: number
  /** Précision annoncée par le téléphone, en mètres. */
  precision: number
  /** Quand elle a été relevée (ISO). */
  quand: string
  /** La commune, retrouvée après coup — sert aux textes des alertes. */
  commune?: string
}

export interface IncidentAutour {
  cle: string
  categorie: number
  gravite: number
  retardMin: number
  description: string
  de: string
  vers: string
  route: string
  km: number
  distanceKm: number
  lat: number
  lon: number
}

/** Les pictogrammes TomTom, traduits en emoji parlant. */
export const EMOJI_INCIDENT: Record<number, string> = {
  0: '⚠️',
  1: '💥',
  2: '🌫️',
  3: '⚠️',
  4: '🌧️',
  5: '🧊',
  6: '🚗',
  7: '🚧',
  8: '⛔',
  9: '🚧',
  10: '💨',
  11: '🌊',
  14: '🔧',
}

export const libelleIncident = (categorie: number): string =>
  ({
    1: 'Accident',
    2: 'Brouillard',
    3: 'Conditions dangereuses',
    4: 'Pluie',
    5: 'Verglas',
    6: 'Bouchon',
    7: 'Voie fermée',
    8: 'Route coupée',
    9: 'Travaux',
    10: 'Vent',
    11: 'Inondation',
    14: 'Véhicule en panne',
  })[categorie] ?? 'Perturbation'

/** Rouge dès que ça coûte cher, noir quand c'est coupé. */
export const couleurGravite = (gravite: number): string =>
  ({ 0: '#9aa0a6', 1: '#eab308', 2: '#f97316', 3: '#dc2626', 4: '#111827' })[gravite] ?? '#9aa0a6'

/**
 * Un incident mérite-t-il de DÉRANGER ? On ne prévient que pour ce qui change
 * vraiment un trajet : accident, route coupée, ou gros ralentissement.
 */
export const meriteUneAlerte = (i: IncidentAutour, retardMinimum = 10): boolean => {
  if (i.categorie === 1 || i.categorie === 8) return true // accident, route coupée
  if (i.gravite >= 3) return true // retard majeur
  return i.retardMin >= retardMinimum
}

const CLE_POSITION = 'stg-derniere-position'

/** La dernière position connue de CET appareil (lecture instantanée). */
export function positionMemorisee(): PositionConnue | null {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_POSITION) ?? 'null') as unknown
    if (!brut || typeof brut !== 'object') return null
    const p = brut as Partial<PositionConnue>
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null
    return {
      lat: p.lat as number,
      lon: p.lon as number,
      precision: Number(p.precision) || 0,
      quand: String(p.quand ?? ''),
      ...(p.commune ? { commune: String(p.commune) } : {}),
    }
  } catch {
    return null
  }
}

function memoriser(p: PositionConnue): void {
  try {
    localStorage.setItem(CLE_POSITION, JSON.stringify(p))
  } catch {
    // stockage plein : la position servira quand même pour cette session
  }
}

/**
 * Demande la position au téléphone. Rend `null` si l'on refuse, si le GPS ne
 * répond pas, ou si le navigateur ne sait pas faire — jamais d'exception.
 */
export function demanderPosition(delai = 12000): Promise<PositionConnue | null> {
  return new Promise((resoudre) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resoudre(null)
      return
    }
    let rendu = false
    const finir = (valeur: PositionConnue | null) => {
      if (rendu) return
      rendu = true
      resoudre(valeur)
    }
    // Filet : certains iPhone ne rappellent jamais le callback d'erreur.
    const minuterie = setTimeout(() => finir(null), delai + 1000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(minuterie)
        const p: PositionConnue = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          precision: Math.round(pos.coords.accuracy ?? 0),
          quand: new Date().toISOString(),
        }
        memoriser(p)
        finir(p)
      },
      () => {
        clearTimeout(minuterie)
        finir(null)
      },
      { enableHighAccuracy: false, timeout: delai, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/** La commune correspondant à un point (géocodage inverse, gratuit). */
export async function communeDe(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(
      `https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}&limit=1`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!r.ok) return ''
    const d = (await r.json().catch(() => null)) as { features?: { properties?: { city?: unknown } }[] } | null
    const ville = d?.features?.[0]?.properties?.city
    return typeof ville === 'string' ? ville : ''
  } catch {
    return ''
  }
}

/** Les incidents en direct autour d'un point, via le relais de STG. */
export async function traficAutour(lat: number, lon: number, rayonKm: number): Promise<IncidentAutour[]> {
  const { data: session } = await supabase.auth.getSession()
  const r = await fetch('/api/chercher-resto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ mode: 'incidents_autour', lat, lon, rayon: rayonKm }),
  })
  if (!r.ok) throw new Error(`relais ${r.status}`)
  const d = (await r.json().catch(() => null)) as { incidents?: unknown; erreur?: unknown } | null
  if (d?.erreur) throw new Error(String(d.erreur))
  const bruts = Array.isArray(d?.incidents) ? d.incidents : []
  const propre: IncidentAutour[] = []
  for (const b of bruts) {
    if (!b || typeof b !== 'object') continue
    const o = b as Record<string, unknown>
    const la = Number(o['lat'])
    const lo = Number(o['lon'])
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue
    propre.push({
      cle: String(o['cle'] ?? `${la}:${lo}`),
      categorie: Number(o['categorie']) || 0,
      gravite: Number(o['gravite']) || 0,
      retardMin: Number(o['retardMin']) || 0,
      description: String(o['description'] ?? 'Perturbation'),
      de: String(o['de'] ?? ''),
      vers: String(o['vers'] ?? ''),
      route: String(o['route'] ?? ''),
      km: Number(o['km']) || 0,
      distanceKm: Number(o['distanceKm']) || 0,
      lat: la,
      lon: lo,
    })
  }
  return propre
}

// ————————————————— Les réglages d'alerte, par appareil —————————————————

export interface ReglagesTrafic {
  actif: boolean
  rayonKm: number
  retardMinimum: number
}

const CLE_REGLAGES = 'stg-trafic-reglages'
const CLE_VUS = 'stg-trafic-vus'

export const REGLAGES_DEFAUT: ReglagesTrafic = { actif: false, rayonKm: 20, retardMinimum: 10 }

export function reglagesTrafic(): ReglagesTrafic {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? 'null') as Partial<ReglagesTrafic> | null
    if (!brut || typeof brut !== 'object') return REGLAGES_DEFAUT
    return {
      actif: brut.actif === true,
      rayonKm: Math.min(Math.max(Number(brut.rayonKm) || 20, 5), 50),
      retardMinimum: Math.min(Math.max(Number(brut.retardMinimum) || 10, 5), 60),
    }
  } catch {
    return REGLAGES_DEFAUT
  }
}

export function enregistrerReglagesTrafic(r: ReglagesTrafic): void {
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify(r))
  } catch {
    // sans mémoire, les réglages valent pour cette session
  }
}

/** Les incidents déjà signalés — pour ne jamais prévenir deux fois du même. */
export function incidentsDejaVus(): Record<string, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_VUS) ?? '{}') as unknown
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function marquerVus(cles: string[]): void {
  try {
    const vus = incidentsDejaVus()
    const maintenant = Date.now()
    for (const c of cles) vus[c] = maintenant
    // On oublie au bout de 6 h : un accident qui dure sera re-signalé une fois.
    const limite = maintenant - 6 * 3600 * 1000
    const propre = Object.fromEntries(Object.entries(vus).filter(([, quand]) => Number(quand) > limite))
    localStorage.setItem(CLE_VUS, JSON.stringify(propre))
  } catch {
    // sans mémoire, on risque de re-signaler : moins grave que de rater
  }
}
