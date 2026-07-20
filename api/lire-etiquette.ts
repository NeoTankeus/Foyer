// 🕵️ Le Détective des prix : une photo de N'IMPORTE quelle étiquette de rayon
// et Gemini Vision lit le produit, le prix, et surtout le prix au litre/kilo.

export const config = { runtime: 'edge' }

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

  const { image } = (await req.json()) as { image?: string }
  if (!image) return new Response(JSON.stringify({ erreur: 'vide' }), { status: 400 })
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
            { role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: CONSIGNE }] },
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
    const donnees = (await reponse.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const brut = donnees.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
    try {
      return new Response(JSON.stringify({ etiquette: JSON.parse(brut) as unknown }), {
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
