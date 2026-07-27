// 👵 La Fenêtre des grands-parents : une page web ultra-simple, en lecture
// seule, ouverte par un lien secret — les photos récentes et les grandes
// dates du foyer, sans compte, sans installation, en GROS caractères.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? ''

async function sb<T>(chemin: string): Promise<T[]> {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE_SERVICE, authorization: `Bearer ${CLE_SERVICE}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!reponse.ok) throw new Error(`${chemin} → ${reponse.status}`)
  const donnees: unknown = await reponse.json()
  // Toujours un tableau : une réponse inattendue ne doit pas faire tomber la page.
  return Array.isArray(donnees) ? (donnees as T[]) : []
}

/** Échappement HTML — accepte aussi null/undefined venus de la base. */
const proteger = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!URL_SUPABASE || !CLE_SERVICE) {
      res.status(503).send('Service indisponible')
      return
    }
    const jeton = String(req.query['jeton'] ?? '')
    if (!jeton || jeton.length < 20) {
      res.status(403).send('Lien invalide')
      return
    }
    const foyers = await sb<{ id: string; nom: string; reglages?: { fenetre_jeton?: string } | null }>(
      'foyers?select=id,nom,reglages&limit=1',
    )
    const foyer = foyers[0]
    // Comparaison stricte sur une chaîne : un `reglages` nul ou un jeton non
    // configuré ne doit jamais ouvrir la porte.
    const jetonAttendu = foyer?.reglages?.fenetre_jeton
    if (!foyer || typeof jetonAttendu !== 'string' || jetonAttendu.length < 20 || jetonAttendu !== jeton) {
      res.status(403).send('Lien invalide ou révoqué')
      return
    }

    const dans7j = new Date(Date.now() + 7 * 86400000).toISOString()
    const maintenant = new Date().toISOString()
    const [souvenirs, evenements, celebrations] = await Promise.all([
      sb<{ titre: string | null; image_donnees: string | null; pris_le: string | null }>(
        'souvenirs?select=titre,image_donnees,pris_le&order=pris_le.desc&limit=6',
      ).catch(() => []),
      sb<{ titre: string | null; debut_a: string | null; journee_entiere: boolean }>(
        `evenements?debut_a=gte.${maintenant}&debut_a=lte.${dans7j}&order=debut_a&select=titre,debut_a,journee_entiere&limit=8`,
      ).catch(() => []),
      sb<{ nom: string | null; date: string | null; magie: boolean }>('celebrations?select=nom,date,magie').catch(() => []),
    ])

    // Une photo sans données d'image ferait planter le rendu : on les écarte.
    const photos = souvenirs.filter((s) => typeof s?.image_donnees === 'string' && s.image_donnees !== '')
    // Un événement sans date lisible n'est pas affichable.
    const rendezVous = evenements.filter(
      (e) => typeof e?.debut_a === 'string' && Number.isFinite(new Date(e.debut_a).getTime()),
    )

    // Les anniversaires des 30 prochains jours (jamais les surprises « magie »).
    const aujourdHui = new Date()
    const fetes = celebrations
      .filter((c) => !c?.magie && typeof c?.date === 'string')
      .map((c) => {
        const [, m, j] = String(c.date).split('-').map(Number)
        if (!m || !j) return null
        let prochaine = new Date(aujourdHui.getFullYear(), m - 1, j)
        if (prochaine < new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate()))
          prochaine = new Date(aujourdHui.getFullYear() + 1, m - 1, j)
        return { nom: c.nom, quand: prochaine }
      })
      .filter((f): f is { nom: string | null; quand: Date } => f !== null && Number.isFinite(f.quand.getTime()))
      .filter((f) => f.quand.getTime() - aujourdHui.getTime() < 30 * 86400000)
      .sort((a, b) => a.quand.getTime() - b.quand.getTime())

    const dateLongue = (d: Date) =>
      Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>La famille — ${proteger(foyer.nom)}</title>
<style>
  body { font-family: -apple-system, Georgia, serif; background: #faf6ef; color: #2b2620; margin: 0; padding: 24px 18px 60px; }
  h1 { font-size: 30px; margin: 0 0 4px; } .sous { color: #8a8071; font-size: 18px; margin: 0 0 24px; }
  h2 { font-size: 22px; margin: 28px 0 10px; border-bottom: 2px solid #e6ddcd; padding-bottom: 6px; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .photos img { width: 100%; height: 160px; object-fit: cover; border-radius: 12px; }
  .ligne { font-size: 20px; line-height: 1.7; }
  .quand { color: #8a8071; }
  footer { margin-top: 40px; font-size: 15px; color: #a99f8d; }
</style></head><body>
<h1>👨‍👩‍👦 Des nouvelles de la famille</h1>
<p class="sous">${proteger(dateLongue(aujourdHui))} — cette page se met à jour toute seule, ajoutez-la à vos favoris.</p>

<h2>📷 Les dernières photos</h2>
${photos.length === 0 ? '<p class="ligne">Pas encore de photos partagées.</p>' : `<div class="photos">${photos.map((s) => `<img src="${String(s.image_donnees).startsWith('data:') ? String(s.image_donnees) : proteger(s.image_donnees)}" alt="${proteger(s.titre ?? 'Photo de famille')}">`).join('')}</div>`}

<h2>📅 La semaine de la famille</h2>
${rendezVous.length === 0 ? '<p class="ligne">Une semaine tranquille !</p>' : rendezVous.map((e) => `<p class="ligne">• <strong>${proteger(e.titre ?? 'Sans titre')}</strong> <span class="quand">— ${proteger(dateLongue(new Date(String(e.debut_a))))}${e.journee_entiere ? '' : ` à ${new Date(String(e.debut_a)).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`}</span></p>`).join('')}

<h2>🎂 À ne pas oublier</h2>
${fetes.length === 0 ? '<p class="ligne">Aucun anniversaire dans le mois.</p>' : fetes.map((f) => `<p class="ligne">• <strong>${proteger(f.nom)}</strong> <span class="quand">— ${proteger(dateLongue(f.quand))}</span></p>`).join('')}

<footer>Avec tout notre amour · STG</footer>
</body></html>`

    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('cache-control', 'private, max-age=300')
    res.status(200).send(html)
  } catch {
    res.status(500).send('Un souci — réessayez dans un instant.')
  }
}
