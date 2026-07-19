// 🦜 Le Perroquet : tu lui parles normalement (« ajoute lait et beurre,
// rendez-vous dentiste jeudi 14h, penser à appeler papi ») — Gemini découpe
// la phrase et range chaque chose au bon endroit.

export const config = { runtime: 'edge' }

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

  const { texte, aujourdhui } = (await req.json()) as { texte?: string; aujourdhui?: string }
  if (!texte?.trim()) {
    return new Response(JSON.stringify({ erreur: 'vide' }), { status: 400 })
  }

  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
  for (const modele of MODELES) {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${CONSIGNE(aujourdhui ?? '')}\n\nDictée : « ${texte.slice(0, 2000)} »` }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.1, responseMimeType: 'application/json' },
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
      return new Response(JSON.stringify({ proposition: JSON.parse(brut) as unknown }), {
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
