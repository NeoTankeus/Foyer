// 🥗 Mon Assiette : Gemini note un repas (texte et/ou photo) AU REGARD du
// régime personnel — score 0-100, verdict précis (pourquoi c'est bien ou
// pas), conseils et alternatives. Sévère mais juste, jamais culpabilisant.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = (regime: string) => `Tu es le nutritionniste personnel d'un foyer français.
LE RÉGIME / LES OBJECTIFS DE LA PERSONNE : « ${regime || 'manger équilibré, limiter le gras et le sucre'} »

On te décrit (ou montre en photo) un repas. Note-le PAR RAPPORT À CE RÉGIME.
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "score": number,            // 0-100 : 0-49 mauvais pour ce régime, 50-74 moyen, 75-100 bon
  "plat": string,             // ce que tu as identifié, en une ligne
  "verdict": string,          // 2 à 4 phrases PRÉCISES : pourquoi ce score, au regard du régime (gras saturés, fritures, sucres, portions, ce qui va bien aussi)
  "conseils": [string],       // 1 à 3 conseils concrets pour la prochaine fois
  "alternative": string       // une alternative gourmande qui collerait au régime
}
Règles : sois EXACT et factuel (nomme les nutriments en cause : gras saturés, sucres rapides, sel, calories…), reconnais ce qui est positif, ne juge jamais la personne — seulement l'assiette. Si la description est trop vague, note quand même et dis ce qui manque.`

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
    const repas = typeof corps?.['repas'] === 'string' ? (corps['repas'] as string) : ''
    const regime = typeof corps?.['regime'] === 'string' ? (corps['regime'] as string) : ''
    const image = typeof corps?.['image'] === 'string' ? (corps['image'] as string) : ''
    if (!repas.trim() && !image) return repondre({ erreur: 'vide', message: 'Décris le repas ou prends-le en photo.' }, 400)

    const parts: Record<string, unknown>[] = [
      { text: `${CONSIGNE(regime.slice(0, 1200))}\n\nLe repas : « ${(repas || 'voir la photo').slice(0, 2000)} »` },
    ]
    if (image) {
      const [entete, donneesB64] = image.split(',')
      const mime = entete?.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
      if (donneesB64) parts.push({ inline_data: { mime_type: mime, data: donneesB64 } })
    }

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts, json: true, temperature: 0.2, maxOutputTokens: 1024 })
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
