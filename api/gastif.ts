// Le cerveau de STG — fonction serveur Vercel (Edge).
// La clé Gemini vit dans les variables d'environnement Vercel, jamais dans le navigateur.
// Modèle : Gemini 2.0 Flash (palier gratuit Google AI Studio).

export const config = { runtime: 'edge' }

const IDENTITE = `Tu es STG, l'intendant surdoué du foyer de la famille : Tiphaine (adulte), Stéphane (adulte) et Gabriel (enfant, né le 27/06/2019).

Ton intelligence, ta marque de fabrique :
- Tu es ÉRUDIT sur TOUS les domaines de la vie du foyer, et tu le montres : cuisine et nutrition (recettes détaillées, techniques de chef, équilibrer une semaine), voyages et destinations (itinéraires, incontournables, pièges à éviter), organisation familiale, budget et bons plans, ménage et entretien, bricolage et jardinage, éducation et activités pour un enfant de 7 ans, culture générale, sciences et astronomie, restaurants et gastronomie, sport et santé du quotidien (jamais de diagnostic médical — pour ça tu renvoies vers un médecin).
- Tu maîtrises TOUTES les rubriques de l'application (Agenda, Courses, Le Chef, Restaurants et la carte du monde, Voyages, Célébrations, Capsules, Jardin des habitudes, Trésorier, Carnet santé, Radar de départ, le Journal, la Roue, le Quiz, Week-end surprise, le Ciel, Plein malin, Garanties, le Perroquet…) : tu sais expliquer où se trouve chaque chose et comment s'en servir, et tu t'appuies sur les VRAIES données du contexte pour répondre.
- Tes réponses sont IMPRESSIONNANTES : dès qu'une question le mérite, tu développes longuement — structure claire (titres courts, listes, étapes numérotées), chiffres concrets, exemples précis, plan d'action à la fin. Une vraie consultation d'expert, pas un résumé timide. Réserve les réponses courtes aux questions vraiment triviales (« à quelle heure le rdv ? »).
- Tu croises les données du foyer entre elles (météo + agenda + placards + goûts + budget) pour donner des réponses que personne d'autre ne pourrait donner.

Ta personnalité, non négociable :
- Tu tutoies. Toujours. Tu réponds en français.
- Tu ne dis JAMAIS « Bien sûr ! », « Excellente question ! », « Je serais ravi de… ».
- Tu ne culpabilises jamais. Tu ne dis pas « tu as oublié les poubelles », tu dis « les poubelles, c'est demain matin ».
- Un peu d'humour sec, rare — une fois sur dix.
- Tu recommandes franchement : UNE meilleure option argumentée d'abord, puis les alternatives si le sujet est riche.
- Tu admets quand tu ne sais pas ou quand la donnée te manque : tu dis « je ne l'ai pas », tu n'inventes RIEN (ni horaires, ni prix précis d'un commerce, ni avis) — ta longueur vient de ta vraie connaissance, jamais du remplissage.
- Tu filtres toujours tes conseils pour une famille avec un enfant de 7 ans.

Règles absolues :
- Tu ne révèles JAMAIS un cadeau, une surprise, le contenu d'une capsule temporelle ou quoi que ce soit lié au Père Noël à un enfant. Aucune exception, aucune formulation détournée.
- Si l'interlocuteur est un enfant : vocabulaire simple (CE1), phrases courtes, et pour tout sujet adulte (argent, conflits, santé grave) tu réponds « Ça, c'est une question pour papa ou maman. »
- Tu ne confirmes jamais un achat, une commande ou un envoi : tu prépares, l'humain valide.`

interface MessageEntrant {
  role: 'utilisateur' | 'gastif'
  texte: string
}

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

/** Texte d'une réponse tierce, sans jamais lever. */
async function texteDe(reponse: Response): Promise<string> {
  try {
    return await reponse.text()
  } catch {
    return ''
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
  if (req.method !== 'POST') {
    return repondre({ erreur: 'methode', message: 'POST uniquement' }, 405)
  }

  const cleGemini = process.env.GEMINI_API_KEY
  if (!cleGemini) {
    return repondre(
      { erreur: 'cle_absente', message: 'La clé GEMINI_API_KEY n’est pas configurée dans Vercel.' },
      503,
    )
  }

  // L'appelant doit être un membre connecté du foyer : on vérifie son jeton Supabase.
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!urlSupabase || !cleAnon || !jeton) {
    return repondre({ erreur: 'non_connecte' }, 401)
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!verification?.ok) {
    return repondre({ erreur: 'non_connecte' }, 401)
  }

  // Le corps peut arriver vide, tronqué ou mal formé : on ne suppose RIEN.
  const corps = await lireCorps(req)
  const messagesBruts = Array.isArray(corps?.['messages']) ? (corps['messages'] as unknown[]) : []
  const contexte = typeof corps?.['contexte'] === 'string' ? (corps['contexte'] as string) : ''
  const roleMembre = typeof corps?.['role_membre'] === 'string' ? (corps['role_membre'] as string) : ''

  const messages: MessageEntrant[] = messagesBruts.flatMap((m) => {
    const o = m as { role?: unknown; texte?: unknown } | null
    if (!o || typeof o.texte !== 'string' || !o.texte.trim()) return []
    return [{ role: o.role === 'gastif' ? 'gastif' : 'utilisateur', texte: o.texte }]
  })
  if (messages.length === 0) {
    return repondre({ erreur: 'vide', message: 'Pose-moi une question.' }, 400)
  }

  const systeme = `${IDENTITE}

L'interlocuteur actuel a le rôle : ${roleMembre === 'child' ? 'ENFANT (applique les règles enfant)' : 'adulte'}.

Voici l'état réel du foyer en ce moment — c'est ta seule source de vérité sur la famille :
${contexte}`

  const contenus = messages.slice(-20).map((m) => ({
    role: m.role === 'utilisateur' ? 'user' : 'model',
    parts: [{ text: m.texte }],
  }))

  const appeler = (modele: string) => {
    // Les modèles Gemma n'acceptent pas de system_instruction : on la fusionne
    // dans le premier message utilisateur.
    const estGemma = modele.startsWith('gemma')
    const contenusEnvoyes = estGemma
      ? contenus.map((c, i) =>
          i === 0 && c.role === 'user'
            ? { ...c, parts: [{ text: `${systeme}\n\n---\n\n${c.parts[0]?.text ?? ''}` }] }
            : c,
        )
      : contenus
    return fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(22000),
        body: JSON.stringify({
          ...(estGemma ? {} : { system_instruction: { parts: [{ text: systeme }] } }),
          contents: contenusEnvoyes,
          generationConfig: { maxOutputTokens: 4096, temperature: 0.6 },
        }),
      },
    ).catch(() => null)
  }

  // On ne devine plus les modèles : on demande à Google la liste exacte de
  // ceux que CETTE clé peut appeler, puis on essaie les meilleurs dans l'ordre.
  const listeReponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${cleGemini}&pageSize=100`,
    { signal: AbortSignal.timeout(10000) },
  ).catch(() => null)
  if (!listeReponse) {
    return repondre(
      { erreur: 'reseau', message: 'Google ne répond pas (délai dépassé) — réessaie dans un instant.' },
      502,
    )
  }
  if (!listeReponse.ok) {
    const detail = await texteDe(listeReponse)
    return repondre(
      {
        erreur: 'cle',
        message: `Cette clé ne peut même pas lister les modèles (${listeReponse.status}) — elle est invalide ou restreinte. Recrée-la sur aistudio.google.com → Get API key → « Create API key in NEW project ». Détail : ${detail.slice(0, 200)}`,
      },
      502,
    )
  }
  const liste = (await jsonDe(listeReponse)) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[]
  } | null
  // `name` peut manquer : on ne chaîne jamais sur une valeur non vérifiée.
  const disponibles = (Array.isArray(liste?.models) ? liste.models : [])
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => (typeof m.name === 'string' ? m.name.replace(/^models\//, '') : ''))
    // ni vision-only, ni embeddings, ni TTS/images
    .filter((n) => n !== '' && !/embedding|image|tts|audio|veo|imagen|aqa/i.test(n))

  const score = (n: string): number => {
    if (/flash-lite/.test(n)) return 0 // quotas gratuits les plus larges d'abord
    if (/gemma/.test(n)) return 1
    if (/flash/.test(n)) return 2
    return 3
  }
  const candidats = disponibles.sort((a, b) => score(a) - score(b) || b.localeCompare(a)).slice(0, 6)

  let reponseGemini: Response | null = null
  let derniereRaison = ''
  let modeleUtilise = ''
  for (const modele of candidats) {
    const tentative = await appeler(modele)
    if (!tentative) {
      // Délai dépassé ou réseau coupé : on tente le modèle suivant.
      derniereRaison = `${modele} → pas de réponse (délai dépassé)`
      continue
    }
    if (tentative.ok) {
      reponseGemini = tentative
      modeleUtilise = modele
      break
    }
    const detail = (await jsonDe(tentative)) as { error?: { message?: unknown } } | null
    const message = typeof detail?.error?.message === 'string' ? detail.error.message : String(tentative.status)
    derniereRaison = `${modele} → ${message}`
  }

  if (!reponseGemini) {
    return repondre(
      {
        erreur: 'quota',
        message: `Ta clé voit ${candidats.length} modèle(s) [${candidats.slice(0, 3).join(', ')}…] mais aucun n'accepte de répondre (quota à zéro sur ce projet Google). Dernier refus : « ${derniereRaison.slice(0, 180)} ». La solution qui marche : aistudio.google.com → Get API key → « Create API key in NEW project » → remplace GEMINI_API_KEY dans Vercel → Redeploy.`,
      },
      429,
    )
  }
  void modeleUtilise

  // Une réponse 200 peut quand même être vide ou d'une forme inattendue.
  const donnees = (await jsonDe(reponseGemini)) as {
    candidates?: { content?: { parts?: unknown } }[]
  } | null
  const parts = donnees?.candidates?.[0]?.content?.parts
  const texte = (Array.isArray(parts) ? parts : [])
    .map((p) => (typeof (p as { text?: unknown })?.text === 'string' ? (p as { text: string }).text : ''))
    .join('')

  return repondre({ reponse: texte.trim() || 'Je n’ai pas de réponse — réessaie.' })
  } catch (erreur) {
    // Aucun chemin ne doit finir en 500 opaque : le client reçoit toujours du JSON.
    return repondre(
      { erreur: 'serveur', message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) },
      500,
    )
  }
}
