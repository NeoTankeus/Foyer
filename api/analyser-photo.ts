// Le Sas photo : le mot de l'école, l'affiche, le carton d'invitation…
// Gemini Vision lit l'image et propose événement + tâches + courses.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = `Tu lis la photo d'un document familial : mot de l'école, invitation d'anniversaire, affiche d'activité, ordonnance, planning…
Nous sommes en ${new Date().getFullYear()}. Réponds UNIQUEMENT en JSON :
{
  "resume": string,                      // 1 phrase : ce que dit le document
  "evenement": { "titre": string, "date": "AAAA-MM-JJ", "heure": "HH:MM" | null, "lieu": string | null } | null,
  "taches": [ { "titre": string, "echeance": "AAAA-MM-JJ" | null } ],   // ex. « signer l'autorisation avant le 30/09 »
  "articles": [ string ]                 // choses à acheter mentionnées
}
N'invente rien : ce qui n'est pas écrit n'existe pas.`

/** Toute réponse part en JSON, avec le bon en-tête : le client peut TOUJOURS la lire. */
const repondre = (corps: unknown, status = 200): Response =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** Un corps de requête illisible ne doit jamais devenir un 500. */
async function lireCorps(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const brut: unknown = await req.json()
    return brut && typeof brut === 'object' && !Array.isArray(brut) ? (brut as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return repondre({ erreur: 'methode', message: 'POST uniquement' }, 405)

    const cleGemini = process.env.GEMINI_API_KEY
    const urlSupabase = process.env.VITE_SUPABASE_URL
    const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
    const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!cleGemini) return repondre({ erreur: 'cle_absente', message: 'GEMINI_API_KEY absente de Vercel.' }, 503)
    if (!urlSupabase || !cleAnon || !jeton) return repondre({ erreur: 'non_connecte' }, 401)
    const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
      headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (!verification?.ok) return repondre({ erreur: 'non_connecte' }, 401)

    const corps = await lireCorps(req)
    const image = typeof corps?.['image'] === 'string' ? (corps['image'] as string) : ''
    if (!image) return repondre({ erreur: 'vide', message: 'Aucune photo reçue.' }, 400)
    const base64 = image.replace(/^data:image\/\w+;base64,/, '')

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: CONSIGNE }], json: true, temperature: 0.1, maxOutputTokens: 1024 })
    if (!brut) {
      return repondre(
        { erreur: echec?.genre ?? 'analyse', message: echec?.message ?? 'L’IA n’a pas pu répondre.' },
        echec?.status ?? 502,
      )
    }
    try {
    return repondre({ proposition: JSON.parse(brut) as unknown })
    } catch {
      return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
    }
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
