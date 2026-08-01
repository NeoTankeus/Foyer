// 🧠 Appeler une fonction IA de STG — avec RÉESSAI AUTOMATIQUE.
//
// Le quota gratuit de Google se compte par minute ET par jour, modèle par
// modèle. Un « trop de demandes à l'instant » n'est pas une panne : trente
// secondes plus tard ça repasse. Avant, l'app le montrait comme une erreur et
// c'était à l'utilisateur de réappuyer — d'où l'impression de bugs partout.
//
// Ici, le téléphone attend le délai que le serveur lui indique et retente tout
// seul, deux fois. On ne dérange qu'en dernier recours, et seulement avec une
// raison exacte.
import { supabase } from './supabase'

export interface EchecIa {
  /** quota_jour · quota_minute · autre — pour adapter le message. */
  genre: string
  message: string
  status: number
}

export interface ResultatIa<T> {
  donnees: T | null
  echec: EchecIa | null
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Poste vers un relais IA et rend TOUJOURS un résultat exploitable.
 * `surAttente` permet d'afficher « nouvelle tentative dans 20 s… ».
 */
export async function appelerIa<T = Record<string, unknown>>(
  chemin: string,
  corps: Record<string, unknown>,
  options?: { essais?: number; surAttente?: (secondes: number) => void; delai?: number },
): Promise<ResultatIa<T>> {
  const essaisMax = Math.max(1, options?.essais ?? 3)
  let dernier: EchecIa = { genre: 'reseau', message: 'Connexion impossible — vérifie ton réseau.', status: 0 }

  for (let essai = 0; essai < essaisMax; essai += 1) {
    try {
      const { data: session } = await supabase.auth.getSession()
      const reponse = await fetch(chemin, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.session?.access_token ?? ''}`,
        },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(options?.delai ?? 60000),
      })
      // On lit le corps MÊME en erreur : le serveur y met la vraie raison et,
      // en cas de saturation, le nombre de secondes à patienter.
      const donnees = (await reponse.json().catch(() => null)) as
        | (Record<string, unknown> & { erreur?: string; message?: string; secondes?: number })
        | null

      if (reponse.ok && donnees && !donnees.erreur) return { donnees: donnees as T, echec: null }

      dernier = {
        genre: String(donnees?.erreur ?? (reponse.ok ? 'analyse' : `http_${reponse.status}`)),
        message: String(donnees?.message ?? `Le serveur n’a pas répondu correctement (${reponse.status}).`),
        status: reponse.status,
      }

      // Saturation momentanée : on patiente le délai conseillé et on retente,
      // sans rien demander à personne. Un quota de la JOURNÉE, en revanche, ne
      // se soigne pas en attendant : on s'arrête tout de suite.
      const momentane = reponse.status === 429 && dernier.genre !== 'quota_jour'
      if (!momentane || essai === essaisMax - 1) return { donnees: null, echec: dernier }

      const secondes = Math.min(Math.max(Number(donnees?.secondes) || 20, 5), 45)
      options?.surAttente?.(secondes)
      await attendre(secondes * 1000)
    } catch (e) {
      dernier = {
        genre: 'reseau',
        message: `Connexion impossible — vérifie ton réseau. (${String(e instanceof Error ? e.message : e).slice(0, 60)})`,
        status: 0,
      }
      // Un réseau qui tousse mérite un second essai, pas plus.
      if (essai === essaisMax - 1) return { donnees: null, echec: dernier }
      await attendre(3000)
    }
  }
  return { donnees: null, echec: dernier }
}
