// Cache local + file d'attente de mutations : l'app est 100 % utilisable en avion.
import Dexie, { type Table } from 'dexie'
import type {
  LigneArticle,
  LigneCelebration,
  LigneColis,
  LigneDocument,
  LigneEvenement,
  LigneIdeeCadeau,
  LigneListe,
  LigneMembre,
  LigneMur,
  LigneRecette,
  LigneRecompense,
  LigneRecompenseEchange,
  LigneRepas,
  LigneReservation,
  LigneRoutine,
  LigneRoutineExecution,
  LigneSas,
  LigneSouvenir,
  LigneTache,
  LigneValise,
  LigneVoyage,
} from './basedonnees.types'

export type TableSynchronisee =
  | 'evenements'
  | 'taches'
  | 'listes'
  | 'articles'
  | 'membres'
  | 'celebrations'
  | 'recettes'
  | 'repas'
  | 'idees_cadeaux'
  | 'mur'
  | 'voyages'
  | 'reservations'
  | 'valise'
  | 'documents'
  | 'colis'
  | 'routines'
  | 'routine_executions'
  | 'recompenses'
  | 'recompense_echanges'
  | 'sas'
  | 'souvenirs'

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
  recettes!: Table<LigneRecette, string>
  repas!: Table<LigneRepas, string>
  idees_cadeaux!: Table<LigneIdeeCadeau, string>
  mur!: Table<LigneMur, string>
  voyages!: Table<LigneVoyage, string>
  reservations!: Table<LigneReservation, string>
  valise!: Table<LigneValise, string>
  documents!: Table<LigneDocument, string>
  colis!: Table<LigneColis, string>
  routines!: Table<LigneRoutine, string>
  routine_executions!: Table<LigneRoutineExecution, string>
  recompenses!: Table<LigneRecompense, string>
  recompense_echanges!: Table<LigneRecompenseEchange, string>
  sas!: Table<LigneSas, string>
  souvenirs!: Table<LigneSouvenir, string>
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
    this.version(2).stores({
      recettes: 'id',
      repas: 'id, date',
      idees_cadeaux: 'id, celebration_id',
      mur: 'id, expire_le',
      voyages: 'id, debut',
      reservations: 'id, voyage_id',
      valise: 'id, voyage_id',
      documents: 'id, expire_le',
      colis: 'id, statut',
      routines: 'id, membre_id',
      routine_executions: 'id, routine_id',
      recompenses: 'id',
      recompense_echanges: 'id, membre_id',
      sas: 'id, statut',
    })
    this.version(3).stores({
      souvenirs: 'id, voyage_id, pris_le',
    })
  }
}

export const baseLocale = new BaseFoyer()
