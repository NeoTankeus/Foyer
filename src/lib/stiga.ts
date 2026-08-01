// Poser une question à STG (Gemini via /api/gastif) depuis n'importe quel
// écran — hors conversation : une question, une réponse texte.
//
// L'appel passe par `appelerIa` : si l'IA est momentanément saturée, le
// téléphone patiente le délai indiqué et retente TOUT SEUL. Une douzaine
// d'écrans en profitent d'un coup (Chef, Quiz, Horoscope, Journal, Soirée,
// Week-end, Tribunal, Olympiades, ADN, Interviews, Détective…).
import { appelerIa } from './ia'

export async function demanderAStiga(
  question: string,
  surAttente?: (secondes: number) => void,
): Promise<string> {
  const { donnees, echec } = await appelerIa<{ reponse?: string }>(
    '/api/gastif',
    {
      messages: [{ role: 'utilisateur', texte: question }],
      contexte: '',
      role_membre: 'adult',
    },
    { surAttente, delai: 45000 },
  )
  const texte = typeof donnees?.reponse === 'string' ? donnees.reponse.trim() : ''
  if (!texte) throw new Error(echec?.message ?? 'STG n’a pas répondu — réessaie.')
  return texte
}
