// Vacances scolaires zone B — calendrier officiel de l'Éducation nationale
// (data.education.gouv.fr, gratuit). Cache local 24 h.

export interface Vacances {
  description: string
  debut: string // ISO
  fin: string
}

const CLE_CACHE = 'gastif-vacances-zone-b'

export async function prochainesVacances(): Promise<Vacances[]> {
  try {
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a?: number; liste?: Vacances[] } | null
    if (cache && Array.isArray(cache.liste) && Date.now() - Number(cache.a ?? 0) < 24 * 3600 * 1000) {
      return filtrerAVenir(cache.liste)
    }
  } catch {
    // cache illisible
  }
  const url =
    'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-calendrier-scolaire' +
    '&refine.zones=Zone+B&refine.population=%C3%89l%C3%A8ves&rows=30&sort=start_date'
  const reponse = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null)
  if (!reponse?.ok) return []
  // Une page d'erreur HTML ferait lever .json() et remonterait jusqu'à l'écran.
  const donnees = ((await reponse.json().catch(() => null)) ?? {}) as {
    records?: { fields?: { description?: string; start_date?: string; end_date?: string } }[]
  }
  const vues = new Set<string>()
  const liste: Vacances[] = []
  for (const enregistrement of Array.isArray(donnees.records) ? donnees.records : []) {
    const f = enregistrement?.fields
    if (!f?.description || !f.start_date || !f.end_date) continue
    const cle = `${f.description}:${f.start_date}`
    if (vues.has(cle)) continue
    vues.add(cle)
    liste.push({ description: f.description, debut: f.start_date, fin: f.end_date })
  }
  liste.sort((a, b) => String(a.debut ?? '').localeCompare(String(b.debut ?? '')))
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), liste }))
  } catch {
    // pas grave
  }
  return filtrerAVenir(liste)
}

function filtrerAVenir(liste: Vacances[]): Vacances[] {
  const maintenant = new Date().toISOString()
  // Le cache local peut contenir des entrées incomplètes : on les écarte.
  return liste.filter((v) => v && typeof v.fin === 'string' && v.fin > maintenant).slice(0, 3)
}
