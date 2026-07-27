// Recherche de visuels produits (serveur /api/chercher-image — DuckDuckGo/Bing).
import { supabase } from './supabase'

export async function chercherVisuels(libelles: string[]): Promise<Record<string, string | null>> {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton || libelles.length === 0) return {}
  const reponse = await fetch('/api/chercher-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ libelles: libelles.slice(0, 25) }),
    signal: AbortSignal.timeout(45000),
  })
  if (!reponse.ok) return {}
  const donnees = ((await reponse.json().catch(() => null)) ?? {}) as { images?: Record<string, string | null> }
  const images = donnees.images
  return images && typeof images === 'object' && !Array.isArray(images) ? images : {}
}

/** Plusieurs images candidates pour une requête — l'utilisateur choisit. */
export async function chercherChoixVisuels(requete: string): Promise<string[]> {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton || !requete.trim()) return []
  const reponse = await fetch('/api/chercher-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ requete: requete.trim() }),
    signal: AbortSignal.timeout(45000),
  })
  if (!reponse.ok) return []
  const donnees = ((await reponse.json().catch(() => null)) ?? {}) as { choix?: string[] }
  return Array.isArray(donnees.choix) ? donnees.choix.filter((c): c is string => typeof c === 'string' && c !== '') : []
}
