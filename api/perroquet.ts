// 🦜 Le Perroquet : tu lui parles normalement (« ajoute lait et beurre,
// rendez-vous dentiste jeudi 14h, penser à appeler papi ») — Gemini découpe
// la phrase et range chaque chose au bon endroit.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = (dateAujourdhui: string) => `Tu ranges la dictée d'un parent dans l'application familiale.
Nous sommes le ${dateAujourdhui} (fuseau Europe/Paris). Résous les jours relatifs (« jeudi » = le prochain jeudi, « demain », « dans 3 jours »…).
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "resume": string,                                   // une ligne : ce que tu as compris
  "evenements": [{ "titre": string, "date": "AAAA-MM-JJ", "heure": "HH:MM" | null, "lieu": string | null }],
  "taches":     [{ "titre": string, "echeance": "AAAA-MM-JJ" | null }],
  "articles":   [string],                             // articles de courses, un par élément
  "mur":        [string]                              // petits mots pour la famille (« je rentre tard »)
}
Règles : chaque morceau de la dictée va dans UNE seule liste. « Acheter/prendre/racheter X » → articles (sépare « lait et beurre » en deux). « Rendez-vous / RDV / on va à » avec un jour → evenements. « Penser à / il faut / ne pas oublier » sans date précise → taches. Un message destiné à l'autre parent → mur. N'invente RIEN : pas sûr d'une date → echeance null.`

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
    if (!texte.trim()) return repondre({ erreur: 'vide', message: 'Rien à ranger.' }, 400)

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { parts: [{ text: `${CONSIGNE(aujourdhui)}\n\nDictée : « ${texte.slice(0, 2000)} »` }], json: true, temperature: 0.1, maxOutputTokens: 1024 })
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
