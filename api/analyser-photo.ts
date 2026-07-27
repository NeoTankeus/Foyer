// Le Sas photo : le mot de l'école, l'affiche, le carton d'invitation…
// Gemini Vision lit l'image et propose événement + tâches + courses.

export const config = { runtime: 'edge' }

const CONSIGNE = `Tu lis la photo d'un document familial : mot de l'école, invitation d'anniversaire, affiche d'activité, ordonnance, planning…
Nous sommes en ${new Date().getFullYear()}. Réponds UNIQUEMENT en JSON :
{
  "resume": string,                      // 1 phrase : ce que dit le document
  "evenement": { "titre": string, "date": "AAAA-MM-JJ", "heure": "HH:MM" | null, "lieu": string | null } | null,
  "taches": [ { "titre": string, "echeance": "AAAA-MM-JJ" | null } ],   // ex. « signer l'autorisation avant le 30/09 »
  "articles": [ string ]                 // choses à acheter mentionnées
}
N'invente rien : ce qui n'est pas écrit n'existe pas.`

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
    const base64 = image.replace(/^data:image\/\w+;base64,/, '')

    const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
    let derniereRaison = ''
    for (const modele of MODELES) {
      const reponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: CONSIGNE }] },
            ],
            generationConfig: { maxOutputTokens: 1024, temperature: 0.1, responseMimeType: 'application/json' },
          }),
        },
      ).catch((e: unknown) => {
        derniereRaison = String(e instanceof Error ? e.message : e).slice(0, 80)
        return null
      })
      if (!reponse) continue // réseau coupé ou trop lent : modèle suivant
      if (reponse.status === 429 || reponse.status === 404) continue
      if (!reponse.ok) return repondre({ erreur: 'analyse', message: `Gemini ${reponse.status}` }, 502)

      const brut = texteGemini(await jsonDe(reponse))
      if (!brut) return repondre({ erreur: 'analyse', message: 'Réponse vide de l’IA' }, 502)
      try {
        return repondre({ proposition: JSON.parse(brut) as unknown })
      } catch {
        return repondre({ erreur: 'analyse', message: 'Réponse illisible' }, 502)
      }
    }
    return repondre(
      { erreur: 'quota', message: `Quota IA atteint — réessaie dans une minute.${derniereRaison ? ` (${derniereRaison})` : ''}` },
      429,
    )
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
