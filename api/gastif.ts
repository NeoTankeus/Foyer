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

  const appeler = (modele: string) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systeme }] },
          contents: contenus,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.6 },
        }),
      },
    )

  // Palier gratuit : en cas de 429 (quota par minute), on bascule sur le
  // modèle lite (quota plus large), puis on explique calmement s'il sature aussi.
  let reponseGemini = await appeler('gemini-2.0-flash')
  if (reponseGemini.status === 429) {
    reponseGemini = await appeler('gemini-2.0-flash-lite')
  }
  if (reponseGemini.status === 429) {
    return new Response(
      JSON.stringify({
        erreur: 'quota',
        message: 'Gastif a atteint son quota gratuit de la minute. Attends 30 secondes et repose ta question.',
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
