// Poser une question à STG (Gemini via /api/gastif) depuis n'importe quel
// écran — hors conversation : une question, une réponse texte.
import { supabase } from './supabase'

export async function demanderAStiga(question: string): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  const jeton = session.session?.access_token
  if (!jeton) throw new Error('Reconnecte-toi pour parler à STG.')
  const reponse = await fetch('/api/gastif', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'utilisateur', texte: question }],
      contexte: '',
      role_membre: 'adult',
    }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null)
  if (!reponse) throw new Error('STG ne répond pas — vérifie ta connexion.')
  // Une passerelle Vercel en timeout renvoie du HTML : .json() lèverait ici.
  const donnees = ((await reponse.json().catch(() => null)) ?? {}) as {
    reponse?: string
    message?: string
    erreur?: string
  }
  if (!reponse.ok || typeof donnees.reponse !== 'string' || !donnees.reponse.trim()) {
    throw new Error(donnees.message ?? donnees.erreur ?? 'STG n’a pas répondu')
  }
  return donnees.reponse
}
