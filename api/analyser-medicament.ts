// 💊 Ma Pharmacie : Gemini lit la photo d'une boîte de médicament française
// et explique simplement à quoi il sert, la posologie usuelle adulte, les
// précautions importantes et s'il existe en générique. Toujours renvoyer
// vers la notice — l'app ne remplace ni le médecin ni le pharmacien.

export const config = { runtime: 'edge' }

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

  const parts: Record<string, unknown>[] = [{ text: CONSIGNE }]
  const [entete, donneesB64] = image.split(',')
  const mime = entete?.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
  if (donneesB64) parts.push({ inline_data: { mime_type: mime, data: donneesB64 } })

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
            generationConfig: { maxOutputTokens: 1024, temperature: 0.1, responseMimeType: 'application/json' },
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
