// 👵 La Fenêtre des grands-parents : une page web ultra-simple, en lecture
// seule, ouverte par un lien secret — les photos récentes et les grandes
// dates du foyer, sans compte, sans installation, en GROS caractères.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? ''

async function sb<T>(chemin: string): Promise<T> {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE_SERVICE, authorization: `Bearer ${CLE_SERVICE}` },
  })
  if (!reponse.ok) throw new Error(`${chemin} → ${reponse.status}`)
  return (await reponse.json()) as T
}

const proteger = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
    const foyers = await sb<{ id: string; nom: string; reglages?: { fenetre_jeton?: string } }[]>(
      'foyers?select=id,nom,reglages&limit=1',
    )
    const foyer = foyers[0]
    if (!foyer || foyer.reglages?.fenetre_jeton !== jeton) {
      res.status(403).send('Lien invalide ou révoqué')
      return
    }

    const dans7j = new Date(Date.now() + 7 * 86400000).toISOString()
    const maintenant = new Date().toISOString()
    const [souvenirs, evenements, celebrations] = await Promise.all([
      sb<{ titre: string | null; image_donnees: string; pris_le: string }[]>(
        'souvenirs?select=titre,image_donnees,pris_le&order=pris_le.desc&limit=6',
      ),
      sb<{ titre: string; debut_a: string; journee_entiere: boolean }[]>(
        `evenements?debut_a=gte.${maintenant}&debut_a=lte.${dans7j}&order=debut_a&select=titre,debut_a,journee_entiere&limit=8`,
      ),
      sb<{ nom: string; date: string; magie: boolean }[]>('celebrations?select=nom,date,magie'),
    ])

    // Les anniversaires des 30 prochains jours (jamais les surprises « magie »).
    const aujourdHui = new Date()
    const fetes = celebrations
      .filter((c) => !c.magie)
      .map((c) => {
        const [, m, j] = c.date.split('-').map(Number)
        let prochaine = new Date(aujourdHui.getFullYear(), (m ?? 1) - 1, j ?? 1)
        if (prochaine < new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate()))
          prochaine = new Date(aujourdHui.getFullYear() + 1, (m ?? 1) - 1, j ?? 1)
        return { nom: c.nom, quand: prochaine }
      })
      .filter((f) => f.quand.getTime() - aujourdHui.getTime() < 30 * 86400000)
      .sort((a, b) => a.quand.getTime() - b.quand.getTime())

    const dateLongue = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

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
${souvenirs.length === 0 ? '<p class="ligne">Pas encore de photos partagées.</p>' : `<div class="photos">${souvenirs.map((s) => `<img src="${s.image_donnees.startsWith('data:') ? s.image_donnees : proteger(s.image_donnees)}" alt="${proteger(s.titre ?? 'Photo de famille')}">`).join('')}</div>`}

<h2>📅 La semaine de la famille</h2>
${evenements.length === 0 ? '<p class="ligne">Une semaine tranquille !</p>' : evenements.map((e) => `<p class="ligne">• <strong>${proteger(e.titre)}</strong> <span class="quand">— ${proteger(dateLongue(new Date(e.debut_a)))}${e.journee_entiere ? '' : ` à ${new Date(e.debut_a).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`}</span></p>`).join('')}

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
