// 🕵️ Le Détective des prix : une photo de N'IMPORTE quelle étiquette de rayon
// et Gemini Vision lit le produit, le prix, et surtout le prix au litre/kilo.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = `Tu lis la photo d'une étiquette de prix en rayon (supermarché français).
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "produit": string | null,        // nom du produit tel qu'affiché
  "marque": string | null,
  "prix": number | null,           // le prix affiché en euros
  "quantite": string | null,       // ex "750 g", "6x1 L", "x4"
  "prix_unitaire": number | null,  // le prix AU KILO ou AU LITRE affiché en petit
  "unite": "kg" | "L" | "pièce" | null
}
N'invente rien : illisible = null. Le prix unitaire est souvent écrit en tout petit sous le prix.`

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
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: CONSIGNE }], json: true, temperature: 0.1, maxOutputTokens: 512 })
    if (!brut) {
      return repondre(
        {
          erreur: echec?.genre ?? 'analyse',
          message: echec?.message ?? 'L’IA n’a pas pu répondre.',
          // Le téléphone s'en sert pour réessayer TOUT SEUL.
          ...(echec?.secondes ? { secondes: echec.secondes } : {}),
        },
        echec?.status ?? 502,
      )
    }
    try {
    return repondre({ etiquette: JSON.parse(brut) as unknown })
    } catch {
      return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
    }
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
