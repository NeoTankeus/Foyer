// Poser une question à STG (Gemini via /api/gastif) depuis n'importe quel
// écran — hors conversation : une question, une réponse texte.
import { supabase } from './supabase'

export async function demanderAStiga(question: string): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  const reponse = await fetch('/api/gastif', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'utilisateur', texte: question }],
      contexte: '',
      role_membre: 'adult',
    }),
  })
  const donnees = (await reponse.json()) as { reponse?: string; message?: string; erreur?: string }
  if (!reponse.ok || !donnees.reponse) {
    throw new Error(donnees.message ?? donnees.erreur ?? 'STG n’a pas répondu')
  }
  return donnees.reponse
}
