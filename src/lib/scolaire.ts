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
    const cache = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { a: number; liste: Vacances[] } | null
    if (cache && Date.now() - cache.a < 24 * 3600 * 1000) return filtrerAVenir(cache.liste)
  } catch {
    // cache illisible
  }
  const url =
    'https://data.education.gouv.fr/api/records/1.0/search/?dataset=fr-en-calendrier-scolaire' +
    '&refine.zones=Zone+B&refine.population=%C3%89l%C3%A8ves&rows=30&sort=start_date'
  const reponse = await fetch(url)
  if (!reponse.ok) return []
  const donnees = (await reponse.json()) as {
    records?: { fields?: { description?: string; start_date?: string; end_date?: string } }[]
  }
  const vues = new Set<string>()
  const liste: Vacances[] = []
  for (const enregistrement of donnees.records ?? []) {
    const f = enregistrement.fields
    if (!f?.description || !f.start_date || !f.end_date) continue
    const cle = `${f.description}:${f.start_date}`
    if (vues.has(cle)) continue
    vues.add(cle)
    liste.push({ description: f.description, debut: f.start_date, fin: f.end_date })
  }
  liste.sort((a, b) => a.debut.localeCompare(b.debut))
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({ a: Date.now(), liste }))
  } catch {
    // pas grave
  }
  return filtrerAVenir(liste)
}

function filtrerAVenir(liste: Vacances[]): Vacances[] {
  const maintenant = new Date().toISOString()
  return liste.filter((v) => v.fin > maintenant).slice(0, 3)
}
