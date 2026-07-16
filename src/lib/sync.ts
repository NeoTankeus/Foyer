// Écritures hors ligne : on applique localement, on empile, on rejoue au retour
// du réseau. Résolution last-write-wins (le journal des écrasements viendra
// avec la sync CalDAV, phase 3).
import type { Table } from 'dexie'
import { supabase } from './supabase'
import { baseLocale, type MutationEnAttente, type TableSynchronisee } from './dexie'

function tableLocale(nom: TableSynchronisee): Table<Record<string, unknown>, string> {
  return baseLocale[nom] as unknown as Table<Record<string, unknown>, string>
}

async function executerADistance(m: MutationEnAttente): Promise<void> {
  const table = supabase.from(m.table)
  if (m.type === 'insert') {
    const { error } = await table.insert(m.charge as never)
    if (error) throw error
  } else if (m.type === 'update') {
    const { error } = await table.update(m.charge as never).eq('id', m.cible_id)
    if (error) throw error
  } else {
    const { error } = await table.delete().eq('id', m.cible_id)
    if (error) throw error
  }
}

function appliquerLocalement(m: MutationEnAttente): Promise<unknown> {
  const locale = tableLocale(m.table)
  if (m.type === 'delete') return locale.delete(m.cible_id)
  if (m.type === 'insert') return locale.put({ ...m.charge, id: m.cible_id })
  return locale
    .get(m.cible_id)
    .then((existant) => locale.put({ ...(existant ?? {}), ...m.charge, id: m.cible_id }))
}

/**
 * Point d'entrée unique des écritures. Applique localement (optimiste),
 * tente le serveur, empile si le réseau manque.
 */
export async function muter(
  entree: Omit<MutationEnAttente, 'id' | 'cree_le'>,
): Promise<void> {
  const mutation: MutationEnAttente = {
    ...entree,
    id: crypto.randomUUID(),
    cree_le: Date.now(),
  }
  await appliquerLocalement(mutation)
  try {
    await executerADistance(mutation)
  } catch (erreur) {
    if (estErreurReseau(erreur)) {
      await baseLocale.file_attente.put(mutation)
    } else {
      throw erreur
    }
  }
}

function estErreurReseau(erreur: unknown): boolean {
  if (!navigator.onLine) return true
  const message = erreur instanceof Error ? erreur.message : String(erreur)
  return /fetch|network|Failed to fetch|abort/i.test(message)
}

let rejeuEnCours = false

/** Rejoue la file d'attente dans l'ordre. S'arrête au premier échec réseau. */
export async function rejouerFileAttente(): Promise<void> {
  if (rejeuEnCours) return
  rejeuEnCours = true
  try {
    const enAttente = await baseLocale.file_attente.orderBy('cree_le').toArray()
    for (const mutation of enAttente) {
      try {
        await executerADistance(mutation)
        await baseLocale.file_attente.delete(mutation.id)
      } catch (erreur) {
        if (estErreurReseau(erreur)) return // on retentera au prochain passage
        // Erreur serveur (conflit, droit) : on abandonne cette mutation, on continue.
        console.warn('Mutation abandonnée', mutation, erreur)
        await baseLocale.file_attente.delete(mutation.id)
      }
    }
  } finally {
    rejeuEnCours = false
  }
}

export function demarrerSyncAuRetourDuReseau(): void {
  window.addEventListener('online', () => {
    void rejouerFileAttente()
  })
  void rejouerFileAttente()
}
