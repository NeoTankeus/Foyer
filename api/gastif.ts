// Le cerveau de Gastif — fonction serveur Vercel (Edge).
// La clé Gemini vit dans les variables d'environnement Vercel, jamais dans le navigateur.
// Modèle : Gemini 2.0 Flash (palier gratuit Google AI Studio).

export const config = { runtime: 'edge' }

const IDENTITE = `Tu es Gastif, l'intendant du foyer de la famille : Tiphaine (adulte), Stéphane (adulte) et Gabriel (enfant, né le 27/06/2019).

Ta personnalité, non négociable :
- Tu tutoies. Toujours. Tu réponds en français.
- Tu es bref quand la réponse est brève, détaillé quand ça sert.
- Tu ne dis JAMAIS « Bien sûr ! », « Excellente question ! », « Je serais ravi de… ».
- Tu ne culpabilises jamais. Tu ne dis pas « tu as oublié les poubelles », tu dis « les poubelles, c'est demain matin ».
- Un peu d'humour sec, rare — une fois sur dix.
- Tu proposes UNE chose, pas cinq. Avec une alternative si on refuse.
- Tu admets quand tu ne sais pas ou quand la donnée te manque : tu dis « je ne l'ai pas », tu n'inventes RIEN (ni horaires, ni prix, ni avis précis).
- Tu connais bien les destinations, les lieux à voir, l'organisation d'une famille, le ménage, les astuces du quotidien — et tu filtres toujours tes conseils pour une famille avec un enfant de 7 ans.

Règles absolues :
- Tu ne révèles JAMAIS un cadeau, une surprise ou quoi que ce soit lié au Père Noël à un enfant. Aucune exception, aucune formulation détournée.
- Si l'interlocuteur est un enfant : vocabulaire simple (CE1), phrases courtes, et pour tout sujet adulte (argent, conflits, santé grave) tu réponds « Ça, c'est une question pour papa ou maman. »
- Tu ne confirmes jamais un achat, une commande ou un envoi : tu prépares, l'humain valide.`

interface MessageEntrant {
  role: 'utilisateur' | 'gastif'
  texte: string
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ erreur: 'Méthode non autorisée' }), { status: 405 })
  }

  const cleGemini = process.env.GEMINI_API_KEY
  if (!cleGemini) {
    return new Response(
      JSON.stringify({ erreur: 'cle_absente', message: 'La clé GEMINI_API_KEY n’est pas configurée dans Vercel.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }

  // L'appelant doit être un membre connecté du foyer : on vérifie son jeton Supabase.
  const urlSupabase = process.env.VITE_SUPABASE_URL
  const cleAnon = process.env.VITE_SUPABASE_ANON_KEY
  const jeton = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!urlSupabase || !cleAnon || !jeton) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }
  const verification = await fetch(`${urlSupabase}/auth/v1/user`, {
    headers: { apikey: cleAnon, authorization: `Bearer ${jeton}` },
  })
  if (!verification.ok) {
    return new Response(JSON.stringify({ erreur: 'non_connecte' }), { status: 401 })
  }

  const corps = (await req.json()) as {
    messages: MessageEntrant[]
    contexte: string
    role_membre?: string
  }

  const systeme = `${IDENTITE}

L'interlocuteur actuel a le rôle : ${corps.role_membre === 'child' ? 'ENFANT (applique les règles enfant)' : 'adulte'}.

Voici l'état réel du foyer en ce moment — c'est ta seule source de vérité sur la famille :
${corps.contexte}`

  const contenus = corps.messages.slice(-20).map((m) => ({
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
        body: JSON.stringify({
          ...(estGemma ? {} : { system_instruction: { parts: [{ text: systeme }] } }),
          contents: contenusEnvoyes,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.6 },
        }),
      },
    )
  }

  // Cascade de modèles gratuits : certains projets Google n'ont aucun quota
  // sur certains modèles — on essaie jusqu'à trouver celui qui répond.
  const MODELES = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemma-3-27b-it']
  let reponseGemini: Response | null = null
  let derniereRaison = ''
  for (const modele of MODELES) {
    const tentative = await appeler(modele)
    if (tentative.ok) {
      reponseGemini = tentative
      break
    }
    if (tentative.status === 429 || tentative.status === 404) {
      try {
        const detail = (await tentative.json()) as { error?: { message?: string } }
        derniereRaison = detail.error?.message ?? ''
      } catch { /* corps illisible */ }
      continue // modèle suivant
    }
    reponseGemini = tentative // autre erreur : on la traite plus bas
    break
  }

  if (!reponseGemini) {
    return new Response(
      JSON.stringify({
        erreur: 'quota',
        message: `Aucun modèle gratuit ne répond avec cette clé. Détail Google : « ${derniereRaison.slice(0, 200) || 'aucun'} ». Solution : sur aistudio.google.com → Get API key → « Create API key in NEW project », puis remplace GEMINI_API_KEY dans Vercel et redéploie.`,
      }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    )
  }

  if (!reponseGemini.ok) {
    const detail = await reponseGemini.text()
    return new Response(
      JSON.stringify({ erreur: 'gemini', message: `Gemini a répondu ${reponseGemini.status}`, detail: detail.slice(0, 300) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }

  const donnees = (await reponseGemini.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const texte =
    donnees.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
    'Je n’ai pas de réponse — réessaie.'

  return new Response(JSON.stringify({ reponse: texte }), {
    headers: { 'content-type': 'application/json' },
  })
}
