// 🥗 Mon Assiette : Gemini note un repas (texte et/ou photo) AU REGARD du
// régime personnel — score 0-100, verdict précis (pourquoi c'est bien ou
// pas), conseils et alternatives. Sévère mais juste, jamais culpabilisant.

export const config = { runtime: 'edge' }

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

  const { repas, regime, image } = (await req.json()) as { repas?: string; regime?: string; image?: string }
  if (!repas?.trim() && !image) return new Response(JSON.stringify({ erreur: 'vide' }), { status: 400 })

  const parts: Record<string, unknown>[] = [
    { text: `${CONSIGNE((regime ?? '').slice(0, 1200))}\n\nLe repas : « ${(repas ?? 'voir la photo').slice(0, 2000)} »` },
  ]
  if (image) {
    const [entete, donneesB64] = image.split(',')
    const mime = entete?.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
    if (donneesB64) parts.push({ inline_data: { mime_type: mime, data: donneesB64 } })
  }

  // Même endurance que la Boîte aux lettres : 4 modèles, 3 vagues.
  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
  const PAUSES = [0, 2500, 5000]
  for (const pause of PAUSES) {
    if (pause > 0) await new Promise((res) => setTimeout(res, pause))
    for (const modele of MODELES) {
      const reponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.2, responseMimeType: 'application/json' },
          }),
        },
      )
      if (reponse.status === 429 || reponse.status === 404 || reponse.status === 503) continue
      if (!reponse.ok) {
        return new Response(JSON.stringify({ erreur: 'analyse', message: `Gemini ${reponse.status}` }), {
          status: 502, headers: { 'content-type': 'application/json' },
        })
      }
      const donnees = (await reponse.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const brut = donnees.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}'
      try {
        return new Response(JSON.stringify({ proposition: JSON.parse(brut) as unknown }), {
          headers: { 'content-type': 'application/json' },
        })
      } catch {
        return new Response(JSON.stringify({ erreur: 'analyse', message: 'Réponse illisible' }), {
          status: 502, headers: { 'content-type': 'application/json' },
        })
      }
    }
  }
  return new Response(JSON.stringify({ erreur: 'quota', message: 'Les IA sont saturées à l’instant — réessaie dans 1 minute.' }), {
    status: 429, headers: { 'content-type': 'application/json' },
  })
}
