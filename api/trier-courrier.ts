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
    const texte = typeof corps?.['texte'] === 'string' ? (corps['texte'] as string) : ''
    const aujourdhui = typeof corps?.['aujourdhui'] === 'string' ? (corps['aujourdhui'] as string) : ''
    if (!texte.trim()) return repondre({ erreur: 'vide', message: 'Rien à trier.' }, 400)

    // Quatre modèles en cascade, et si TOUS sont saturés (429), on attend un
    // peu et on refait la tournée — jusqu'à 3 vagues. L'utilisateur ne doit
    // (presque) jamais voir « quota atteint ».
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
              contents: [{ role: 'user', parts: [{ text: `${CONSIGNE(aujourdhui)}\n\nCourrier :\n« ${texte.slice(0, 8000)} »` }] }],
              generationConfig: { maxOutputTokens: 1536, temperature: 0.1, responseMimeType: 'application/json' },
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
        message: `Les IA sont toutes saturées à l’instant — réessaie dans 1 minute, ça repartira.${derniereRaison ? ` (${derniereRaison})` : ''}`,
      },
      429,
    )
  } catch (erreur) {
    return repondre({ erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) }, 500)
  }
}
