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

/** JSON d'une réponse tierce : null plutôt qu'une exception. */
async function jsonDe(reponse: Response): Promise<unknown> {
  try {
    return await reponse.json()
  } catch {
    return null
  }
}

/** Le texte d'une réponse Gemini, sans jamais supposer la forme de l'objet. */
function texteGemini(donnees: unknown): string | null {
  const parts = (donnees as { candidates?: { content?: { parts?: unknown } }[] } | null)?.candidates?.[0]?.content
    ?.parts
  if (!Array.isArray(parts)) return null
  const texte = parts.map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? (p as { text: string }).text : '')).join('')
  return texte.trim() ? texte : null
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
    const image = typeof corps?.['image'] === 'string' ? (corps['image'] as string) : ''
    if (!image) return repondre({ erreur: 'vide', message: 'Aucune photo reçue.' }, 400)

    const parts: Record<string, unknown>[] = [{ text: CONSIGNE }]
    const [entete, donneesB64] = image.split(',')
    const mime = entete?.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'
    if (donneesB64) parts.push({ inline_data: { mime_type: mime, data: donneesB64 } })

    // Même endurance que la Boîte aux lettres : 4 modèles, 3 vagues.
    const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
    const PAUSES = [0, 2500, 5000]
    let derniereRaison = ''
    for (const pause of PAUSES) {
      if (pause > 0) await new Promise((res) => setTimeout(res, pause))
      for (const modele of MODELES) {
        const reponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(20000),
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: { maxOutputTokens: 1024, temperature: 0.1, responseMimeType: 'application/json' },
            }),
          },
        ).catch((e: unknown) => {
          derniereRaison = String(e instanceof Error ? e.message : e).slice(0, 80)
          return null
        })
        if (!reponse) continue // réseau coupé ou trop lent : modèle suivant
        if (reponse.status === 429 || reponse.status === 404 || reponse.status === 503) continue
        if (!reponse.ok) return repondre({ erreur: 'analyse', message: `Gemini ${reponse.status}` }, 502)

        const brut = texteGemini(await jsonDe(reponse))
        if (!brut) return repondre({ erreur: 'analyse', message: 'Réponse vide de l’IA' }, 502)
        try {
          return repondre({ proposition: JSON.parse(brut) as unknown })
        } catch {
          return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
        }
      }
    }
    return repondre(
      {
        erreur: 'quota',
        message: `Les IA sont saturées à l’instant — réessaie dans 1 minute.${derniereRaison ? ` (${derniereRaison})` : ''}`,
      },
      429,
    )
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
