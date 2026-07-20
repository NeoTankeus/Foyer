// Chercher des lieux autour d'une position (pharmacies, etc.) — mêmes armes
// que les restaurants : miroirs Overpass en course + relais STG en parallèle.
import { supabase } from './supabase'

export interface LieuAutour {
  id: string
  nom: string
  telephone: string | null
  site: string | null
  horaires: string | null
  latitude: number
  longitude: number
  distanceM: number
}

const MIROIRS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

interface Reponse {
  elements?: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
}

async function viaRelais(lat: number, lon: number, rayonM: number, quoi: string): Promise<Reponse> {
  const { data: session } = await supabase.auth.getSession()
  const reponse = await fetch('/api/chercher-resto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ mode: 'autour', lat, lon, rayon: rayonM, quoi }),
  })
  if (!reponse.ok) throw new Error(`relais ${reponse.status}`)
  const donnees = (await reponse.json()) as Reponse & { erreur?: string }
  if (donnees.erreur) throw new Error(donnees.erreur)
  return donnees
}

export async function chercherLieux(
  lat: number,
  lon: number,
  rayonM: number,
  amenity: string,
  quoi: string,
): Promise<LieuAutour[]> {
  // Les stations-service ont souvent une MARQUE sans « name » dans OSM :
  // pour elles, on ne filtre pas sur le nom (repli marque/exploitant plus bas).
  const filtreNom = quoi === 'stations' ? '' : '[name]'
  const requete = `[out:json][timeout:20];(node(around:${rayonM},${lat},${lon})[amenity~"${amenity}"]${filtreNom};way(around:${rayonM},${lat},${lon})[amenity~"${amenity}"]${filtreNom};);out center 80;`
  const controleurs = MIROIRS.map(() => new AbortController())
  const essais = MIROIRS.map(async (miroir, i) => {
    const coupure = controleurs[i]!
    const minuteur = setTimeout(() => coupure.abort(), 25000)
    try {
      const essai = await fetch(miroir, {
        method: 'POST',
        body: `data=${encodeURIComponent(requete)}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        signal: coupure.signal,
      })
      if (!essai.ok) throw new Error(`serveur cartes : ${essai.status}`)
      return (await essai.json()) as Reponse
    } finally {
      clearTimeout(minuteur)
    }
  })
  let donnees: Reponse
  try {
    donnees = await Promise.any([...essais, viaRelais(lat, lon, rayonM, quoi)])
    for (const c of controleurs) c.abort()
  } catch (e) {
    const motifs = (e instanceof AggregateError ? e.errors : [e]).map((x) =>
      String(x instanceof Error ? x.message : x).slice(0, 60),
    )
    throw new Error(motifs.join(' · ').slice(0, 160))
  }
  const versRad = (d: number) => (d * Math.PI) / 180
  const distance = (la: number, lo: number) => {
    const R = 6371000
    const dLat = versRad(la - lat)
    const dLon = versRad(lo - lon)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(versRad(lat)) * Math.cos(versRad(la)) * Math.sin(dLon / 2) ** 2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }
  const resultats: LieuAutour[] = []
  for (const e of donnees.elements ?? []) {
    const la = e.lat ?? e.center?.lat
    const lo = e.lon ?? e.center?.lon
    const nom = e.tags?.['name'] ?? e.tags?.['brand'] ?? e.tags?.['operator']
    if (la === undefined || lo === undefined || !nom) continue
    resultats.push({
      id: String(e.id),
      nom,
      telephone: e.tags?.['phone'] ?? e.tags?.['contact:phone'] ?? null,
      site: e.tags?.['website'] ?? e.tags?.['contact:website'] ?? null,
      horaires: e.tags?.['opening_hours'] ?? null,
      latitude: la,
      longitude: lo,
      distanceM: distance(la, lo),
    })
  }
  return resultats.sort((a, b) => a.distanceM - b.distanceM)
}
