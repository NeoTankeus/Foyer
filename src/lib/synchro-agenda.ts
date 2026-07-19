// Synchronisation automatique des calendriers Apple : en plus de la tournée
// de 7h, l'import se relance discrètement à l'ouverture de l'app quand la
// dernière synchro locale date de plus de 4 heures. Silencieux, non bloquant.
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

const CLE = 'foyer-derniere-sync-agenda'
const INTERVALLE = 4 * 3600 * 1000

export function importerAgendaSiBesoin(clientRequetes: QueryClient): void {
  try {
    const derniere = Number(localStorage.getItem(CLE) ?? 0)
    if (Date.now() - derniere < INTERVALLE) return
    localStorage.setItem(CLE, String(Date.now()))
  } catch {
    return
  }
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const jeton = data.session?.access_token
      if (!jeton) return
      const reponse = await fetch('/api/importer-ics', {
        method: 'POST',
        headers: { authorization: `Bearer ${jeton}` },
      })
      const resultat = (await reponse.json()) as { importes?: number }
      if ((resultat.importes ?? 0) > 0) {
        await clientRequetes.invalidateQueries({ queryKey: ['evenements'] })
      }
    } catch {
      // pas de réseau ou serveur occupé : la tournée de 7h prendra le relais
    }
  })()
}
