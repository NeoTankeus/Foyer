// Lit un ticket de caisse photographié (restaurant, péage, boutique…) avec
// Gemini Vision et en extrait le montant, le commerçant, la date, la catégorie.

export const config = { runtime: 'edge' }

const CONSIGNE = `Tu lis un ticket de caisse ou une note (restaurant, boutique, péage, parking, musée…).
Réponds UNIQUEMENT en JSON, sans texte autour :
{
  "commercant": string | null,
  "montant": number | null,      // le TOTAL payé, en euros (le plus grand total TTC)
  "date": string | null,         // "AAAA-MM-JJ"
  "categorie": "restaurant" | "courses" | "transport" | "activite" | "hebergement" | "autre"
}
N'invente rien : champ illisible = null.`

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ erreur: 'Méthode non autorisée' }), { status: 405 })
  }
  const cleGemini = process.env.GEMINI_API_KEY
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!cleGemini) return new Response(JSON.stringify({ erreur: 'cle_absente' }), { status: 503 })
  if (!urlSupabase || !cleAnon || !jeton) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
  })
  if (!verification.ok) return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })

  const { image } = (await req.json()) as { image: string } // data URI JPEG
  const base64 = image.replace(/^data:image\/\w+;base64,/, '')

  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
  for (const modele of MODELES) {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: 'image/jpeg', data: base64 } },
                { text: CONSIGNE },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 512, temperature: 0.1, responseMimeType: 'application/json' },
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
    const brut = donnees.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
    try {
      return new Response(JSON.stringify({ ticket: JSON.parse(brut) as unknown }), {
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
