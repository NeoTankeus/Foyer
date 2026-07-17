// Lit un email/texte de confirmation (Booking, Airbnb, SNCF, loueur…) et en
// extrait la ou les réservations, en JSON structuré. Même clé Gemini que Gastif.

export const config = { runtime: 'edge' }

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ erreur: 'Méthode non autorisée' }), { status: 405 })
  }
  const cleGemini = process.env.GEMINI_API_KEY
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!cleGemini) {
    return new Response(JSON.stringify({ erreur: 'cle_absente' }), { status: 503 })
  }
  if (!urlSupabase || !cleAnon || !jeton) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
  })
  if (!verification.ok) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }

  const { texte } = (await req.json()) as { texte: string }
  if (!texte?.trim()) {
    return new Response(JSON.stringify({ reservations: [] }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
  for (const modele of MODELES) {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CONSIGNE }] },
          contents: [{ role: 'user', parts: [{ text: texte.slice(0, 30000) }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.1, responseMimeType: 'application/json' },
        }),
      },
    )
    if (reponse.status === 429 || reponse.status === 404) continue
    if (!reponse.ok) {
      return new Response(JSON.stringify({ erreur: 'analyse', message: `Gemini ${reponse.status}` }), {
        status: 502, headers: { 'content-type': 'application/json' },
      })
    }
    const donnees = (await reponse.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const brut = donnees.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '[]'
    try {
      const reservations = JSON.parse(brut) as unknown[]
      return new Response(JSON.stringify({ reservations: Array.isArray(reservations) ? reservations : [] }), {
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      return new Response(JSON.stringify({ erreur: 'analyse', message: 'Réponse illisible' }), {
        status: 502, headers: { 'content-type': 'application/json' },
      })
    }
  }
  return new Response(JSON.stringify({ erreur: 'quota', message: 'Quota IA atteint, réessaie dans une minute.' }), {
    status: 429, headers: { 'content-type': 'application/json' },
  })
}
