// Cache local + file d'attente de mutations : l'app est 100 % utilisable en avion.
import Dexie, { type Table } from 'dexie'
import type {
  LigneArticle,
  LigneCelebration,
  LigneEvenement,
  LigneListe,
  LigneMembre,
  LigneTache,
} from './basedonnees.types'

export type TableSynchronisee =
  | 'evenements'
  | 'taches'
  | 'listes'
  | 'articles'
  | 'membres'
  | 'celebrations'

export interface MutationEnAttente {
  id: string // uuid client, idempotent
  table: TableSynchronisee
  type: 'insert' | 'update' | 'delete'
  cible_id: string
  charge: Record<string, unknown>
  cree_le: number
}

class BaseFoyer extends Dexie {
  evenements!: Table<LigneEvenement, string>
  taches!: Table<LigneTache, string>
  listes!: Table<LigneListe, string>
  articles!: Table<LigneArticle, string>
  membres!: Table<LigneMembre, string>
  celebrations!: Table<LigneCelebration, string>
  file_attente!: Table<MutationEnAttente, string>

  constructor() {
    super('foyer')
    this.version(1).stores({
      evenements: 'id, debut_a',
      taches: 'id, statut, echeance',
      listes: 'id',
      articles: 'id, liste_id',
      membres: 'id',
      celebrations: 'id, date',
      file_attente: 'id, cree_le',
    })
  }
}

export const baseLocale = new BaseFoyer()
