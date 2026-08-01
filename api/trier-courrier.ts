// 📬 La Boîte aux lettres : tu colles n'importe quel email ou texte
// (confirmation de commande, convocation école, billet…) — Gemini le lit
// et propose de tout ranger : colis, agenda, documents, courses, notes.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = (dateAujourdhui: string) => `Tu tries le courrier d'une famille française.
Nous sommes le ${dateAujourdhui} (Europe/Paris). Résous les dates relatives.
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "resume": string,                                       // une ligne : ce que c'est
  "colis":      [{ "numero": string, "transporteur": string | null, "libelle": string }],
  "evenements": [{ "titre": string, "date": "AAAA-MM-JJ", "heure": "HH:MM" | null, "lieu": string | null }],
  "documents":  [{ "titre": string, "type": "garantie" | "assurance" | "ecole" | "sante" | "autre", "expire_le": "AAAA-MM-JJ" | null }],
  "articles":   [string],                                 // à acheter
  "notes":      [string]                                  // infos à retenir (mur)
}
Règles : numéro de suivi (13-30 caractères alphanumériques) → colis. Rendez-vous/convocation/réunion daté → evenements. Garantie/contrat/attestation avec échéance → documents. Liste de choses à acheter → articles. N'invente RIEN : pas de date sûre → null. Champs vides = tableaux vides.`

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
    const texte = typeof corps?.['texte'] === 'string' ? (corps['texte'] as string) : ''
    const aujourdhui = typeof corps?.['aujourdhui'] === 'string' ? (corps['aujourdhui'] as string) : ''
    if (!texte.trim()) return repondre({ erreur: 'vide', message: 'Rien à trier.' }, 400)

    // Quatre modèles en cascade, et si TOUS sont saturés (429), on attend un
    // peu et on refait la tournée — jusqu'à 3 vagues. L'utilisateur ne doit
    // (presque) jamais voir « quota atteint ».
    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts: [{ text: `${CONSIGNE(aujourdhui)}\n\nCourrier :\n« ${texte.slice(0, 8000)} »` }], json: true, temperature: 0.1, maxOutputTokens: 1536 })
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
    return repondre({ proposition: JSON.parse(brut) as unknown })
    } catch {
      return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
    }
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
