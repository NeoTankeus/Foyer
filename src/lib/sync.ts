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
 * Deux écritures dans la même milliseconde partageaient le même `cree_le` :
 * l'ordre de rejeu devenait alors indéterminé et une modification pouvait
 * écraser la suivante. On garantit un horodatage strictement croissant.
 */
let dernierHorodatage = 0
function horodatageUnique(): number {
  const maintenant = Date.now()
  dernierHorodatage = maintenant > dernierHorodatage ? maintenant : dernierHorodatage + 1
  return dernierHorodatage
}

/** Au-delà, on considère la mutation définitivement refusée par le serveur. */
const ESSAIS_MAX = 5

/** Nombre de tentatives déjà faites sur une mutation en attente. */
function essaisDe(m: MutationEnAttente): number {
  const n = (m as MutationEnAttente & { essais?: unknown }).essais
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Point d'entrée unique des écritures. Applique localement (optimiste),
 * tente le serveur, empile si le réseau manque.
 *
 * Le rejeu est sûr : chaque insertion porte déjà son `id` (une réinsertion
 * donne un conflit de clé, jamais un doublon), une mise à jour rejoue la même
 * charge, et une suppression déjà faite est sans effet.
 */
export async function muter(
  entree: Omit<MutationEnAttente, 'id' | 'cree_le'>,
): Promise<void> {
  const mutation: MutationEnAttente = {
    ...entree,
    id: crypto.randomUUID(),
    cree_le: horodatageUnique(),
  }
  // Un cache local indisponible (Safari privé, quota, base bloquée) ne doit
  // JAMAIS empêcher l'écriture réelle : on continue quoi qu'il arrive.
  try {
    await appliquerLocalement(mutation)
  } catch (erreur) {
    console.warn('Cache local indisponible — on écrit quand même sur le serveur', erreur)
  }
  try {
    await executerADistance(mutation)
  } catch (erreur) {
    if (!estErreurReseau(erreur)) throw erreur
    // Réseau absent : la mutation DOIT survivre. Si même la file refuse de
    // s'écrire, on le dit clairement au lieu de perdre la saisie en silence.
    try {
      await baseLocale.file_attente.put(mutation)
    } catch (erreurFile) {
      console.error('File d’attente inaccessible', erreurFile)
      throw new Error('Impossible d’enregistrer cette modification hors ligne — vérifie l’espace de stockage.')
    }
  }
}

/** Le message d'une erreur, quelle que soit sa forme (Supabase ne rend pas des `Error`). */
function messageDe(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message
  if (erreur && typeof erreur === 'object') {
    const o = erreur as { message?: unknown; details?: unknown; code?: unknown }
    const morceaux = [o.message, o.details, o.code].filter((x) => typeof x === 'string')
    if (morceaux.length > 0) return morceaux.join(' ')
  }
  return String(erreur)
}

function estErreurReseau(erreur: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return /fetch|network|réseau|timeout|abort|Load failed|connexion/i.test(messageDe(erreur))
}

let rejeuEnCours = false

/**
 * Rejoue la file d'attente dans l'ordre. S'arrête au premier échec réseau.
 * Une mutation refusée par le serveur est RETENTÉE (jusqu'à ESSAIS_MAX) avant
 * d'être abandonnée : un 500 passager ne fait plus disparaître une saisie.
 */
export async function rejouerFileAttente(): Promise<void> {
  if (rejeuEnCours) return
  rejeuEnCours = true
  try {
    const enAttente = await baseLocale.file_attente.orderBy('cree_le').toArray()
    for (const mutation of enAttente) {
      // Une entrée corrompue bloquerait la file pour toujours : on l'écarte.
      if (!mutation?.id || !mutation.table || !mutation.type || !mutation.cible_id) {
        if (mutation?.id) await baseLocale.file_attente.delete(mutation.id).catch(() => undefined)
        continue
      }
      try {
        await executerADistance(mutation)
        await baseLocale.file_attente.delete(mutation.id)
      } catch (erreur) {
        if (estErreurReseau(erreur)) return // on retentera au prochain passage
        const essais = essaisDe(mutation) + 1
        if (essais < ESSAIS_MAX) {
          // Erreur serveur peut-être passagère : on garde et on retentera.
          await baseLocale.file_attente
            .put({ ...mutation, essais } as MutationEnAttente)
            .catch(() => undefined)
          continue
        }
        // Refus persistant (conflit, droit) : on abandonne cette mutation.
        console.warn(`Mutation abandonnée après ${essais} tentatives`, mutation, erreur)
        await baseLocale.file_attente.delete(mutation.id).catch(() => undefined)
      }
    }
  } catch (erreur) {
    // File illisible : on réessaiera au prochain retour de réseau.
    console.warn('File d’attente illisible', erreur)
  } finally {
    rejeuEnCours = false
  }
}

export function demarrerSyncAuRetourDuReseau(): void {
  window.addEventListener('online', () => {
    void rejouerFileAttente()
  })
  // Filet de sécurité : au retour au premier plan, on repasse la file — un
  // onglet réveillé après des heures hors ligne ne reçoit pas toujours `online`.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void rejouerFileAttente()
  })
  void rejouerFileAttente()
}
