// Lit un email/texte de confirmation (Booking, Airbnb, SNCF, loueur…) et en
// extrait la ou les réservations, en JSON structuré. Même clé Gemini que Gastif.

export const config = { runtime: 'edge' }

import { demanderIa } from './_gemini.js'

const CONSIGNE = `Tu extrais des réservations depuis des emails de confirmation (Booking, Airbnb, SNCF, Air France, loueurs de voiture, restaurants, activités).
Réponds UNIQUEMENT avec un tableau JSON (éventuellement vide), sans texte autour. Chaque élément :
{
  "type": "hebergement" | "transport" | "location" | "activite" | "restaurant" | "autre",
  "fournisseur": string | null,       // ex. "Booking.com — Hôtel de la Plage"
  "reference": string | null,         // numéro de confirmation
  "debut_a": string | null,           // ISO 8601 avec heure si connue (fuseau Europe/Paris)
  "fin_a": string | null,
  "adresse": string | null,
  "prix": number | null,              // en euros
  "codes_acces": string | null        // codes d'entrée, PIN, etc.
}
N'invente RIEN : un champ inconnu vaut null. Les dates sans heure → 15:00 pour un check-in, 11:00 pour un check-out, 12:00 sinon.`

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
    if (!texte.trim()) return repondre({ reservations: [] })

    // Un SEUL point d'entrée pour toutes les IA de l'app : il lit ce que
    // Google répond vraiment (quota de la minute ? du jour ?) au lieu de
    // relancer douze fois pour rien.
    const { texte: brut, echec } = await demanderIa(cleGemini, { systeme: CONSIGNE, parts: [{ text: texte.slice(0, 30000) }], json: true, temperature: 0.1, maxOutputTokens: 2048 })
    if (!brut) {
      return repondre(
        { erreur: echec?.genre ?? 'analyse', message: echec?.message ?? 'L’IA n’a pas pu répondre.' },
        echec?.status ?? 502,
      )
    }
    try {
    const reservations = JSON.parse(brut) as unknown
    return repondre({ reservations: Array.isArray(reservations) ? reservations : [] })
    } catch {
      return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
    }
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
