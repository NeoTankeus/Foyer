// Lecture « réseau d'abord, cache ensuite » commune à tous les modules.
import type { Table } from 'dexie'
import { baseLocale, type TableSynchronisee } from './dexie'

export async function lireAvecRepli<T extends { id: string }>(
  table: TableSynchronisee,
  distante: () => Promise<T[]>,
): Promise<T[]> {
  const locale = baseLocale[table] as unknown as Table<T, string>
  try {
    const lignes = await distante()
    await locale.bulkPut(lignes)
    return lignes
  } catch {
    return locale.toArray()
  }
}
