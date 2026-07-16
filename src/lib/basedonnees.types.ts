// Types de la base — écrits à la main pour la phase 1, à remplacer par
// `npm run generer:types` (supabase gen types) dès que le projet local tourne.
// Seules les tables utilisées par le front y figurent.

export type RoleMembre = 'adult' | 'child' | 'guest'
export type StatutTache = 'a_faire' | 'faite' | 'annulee'
export type CouleurMembre = 'ambre' | 'sauge' | 'ardoise' | 'prune' | 'corail' | 'or'

export type LigneFoyer = {
  id: string
  nom: string
  fuseau: string
  reglages: Record<string, unknown>
  cree_le: string
}

export type LigneMembre = {
  id: string
  foyer_id: string
  auth_user_id: string | null
  email_invitation: string | null
  prenom: string
  naissance: string | null
  role: RoleMembre
  couleur: CouleurMembre
  avatar_url: string | null
  points: number
  modules_autorises: string[]
  actif_jusqu_au: string | null
  cree_le: string
}

export type LigneEvenement = {
  id: string
  foyer_id: string
  titre: string
  debut_a: string
  fin_a: string
  journee_entiere: boolean
  lieu: string | null
  notes: string | null
  categorie: string | null
  visible_enfant: boolean
  source: 'foyer' | 'icloud' | 'ics'
  source_id: string | null
  sync_token: string | null
  participants: string[]
  cree_par: string | null
  cree_le: string
  modifie_le: string
}

export type LigneTache = {
  id: string
  foyer_id: string
  titre: string
  assignee_id: string | null
  echeance: string | null
  rrule: string | null
  statut: StatutTache
  categorie: string | null
  effort_minutes: number
  points: number
  groupe_rotation: string | null
  faite_par: string | null
  faite_le: string | null
  cree_par: string | null
  cree_le: string
  modifie_le: string
}

export type LigneListe = {
  id: string
  foyer_id: string
  type: 'courses' | 'autre'
  nom: string
  cible_drive: string | null
  cree_le: string
}

export type LigneArticle = {
  id: string
  liste_id: string
  libelle: string
  quantite: number | null
  unite: string | null
  rayon: string
  coche: boolean
  coche_par: string | null
  position: number
  ref_produit: string | null
  ajoute_par: string | null
  cree_le: string
  modifie_le: string
}

export type LigneCelebration = {
  id: string
  foyer_id: string
  nom: string
  date: string
  relation: string | null
  rappels: number[]
  magie: boolean
  membre_id: string | null
  cree_le: string
}

type Table<R> = {
  Row: R
  Insert: Partial<R>
  Update: Partial<R>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      foyers: Table<LigneFoyer>
      membres: Table<LigneMembre>
      evenements: Table<LigneEvenement>
      taches: Table<LigneTache>
      listes: Table<LigneListe>
      articles: Table<LigneArticle>
      celebrations: Table<LigneCelebration>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      role_membre: RoleMembre
      statut_tache: StatutTache
    }
    CompositeTypes: Record<string, never>
  }
}
