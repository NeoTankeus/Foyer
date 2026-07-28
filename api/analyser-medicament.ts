// 💊 Ma Pharmacie : Gemini lit la photo d'une boîte de médicament française
// et explique simplement à quoi il sert, la posologie usuelle adulte, les
// précautions importantes et s'il existe en générique. Toujours renvoyer
// vers la notice — l'app ne remplace ni le médecin ni le pharmacien.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = `Tu es un pharmacien français pédagogue.
On te montre la PHOTO d'une boîte de médicament française. Identifie-le et explique-le simplement.
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "nom": string,              // le nom commercial lu sur la boîte (avec le dosage si visible)
  "substance": string,        // la ou les substances actives (DCI)
  "usage": string,            // 2-3 phrases simples : à quoi ça sert, dans quels cas on le prend
  "posologie": string,        // la posologie usuelle ADULTE en 1-2 phrases, en terminant SYSTÉMATIQUEMENT par une invitation à voir la notice
  "precautions": [string],    // 3 à 5 points importants : interactions, grossesse/allaitement, dose maximale par jour, effets à surveiller…
  "generique": string | null  // s'il existe en générique : lequel/comment le demander ; sinon null
}
Règles : sois factuel et prudent, en français simple compréhensible par toute la famille. Rappelle « voir la notice » dans la posologie. Si la boîte est illisible ou que ce n'est pas un médicament, dis-le dans "nom" et laisse les autres champs prudents.`

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

    const parts: Record<string, unknown>[] = [{ text: CONSIGNE }]
    const [entete, donneesB64] = image.split(',')
    const mime = entete?.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
    if (donneesB64) parts.push({ inline_data: { mime_type: mime, data: donneesB64 } })

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts, json: true, temperature: 0.1, maxOutputTokens: 1024 })
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
