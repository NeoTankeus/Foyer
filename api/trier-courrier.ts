// 📬 La Boîte aux lettres : tu colles n'importe quel email ou texte
// (confirmation de commande, convocation école, billet…) — Gemini le lit
// et propose de tout ranger : colis, agenda, documents, courses, notes.

export const config = { runtime: 'edge' }

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
  if (!texte?.trim()) return new Response(JSON.stringify({ erreur: 'vide' }), { status: 400 })

  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
  for (const modele of MODELES) {
    const reponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${CONSIGNE(aujourdhui ?? '')}\n\nCourrier :\n« ${texte.slice(0, 8000)} »` }] }],
          generationConfig: { maxOutputTokens: 1536, temperature: 0.1, responseMimeType: 'application/json' },
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
