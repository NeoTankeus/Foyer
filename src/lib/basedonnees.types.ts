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
  image_url?: string | null
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
      recettes: Table<LigneRecette>
      repas: Table<LigneRepas>
      idees_cadeaux: Table<LigneIdeeCadeau>
      mur: Table<LigneMur>
      voyages: Table<LigneVoyage>
      reservations: Table<LigneReservation>
      valise: Table<LigneValise>
      documents: Table<LigneDocument>
      colis: Table<LigneColis>
      routines: Table<LigneRoutine>
      routine_executions: Table<LigneRoutineExecution>
      recompenses: Table<LigneRecompense>
      recompense_echanges: Table<LigneRecompenseEchange>
      sas: Table<LigneSas>
      souvenirs: Table<LigneSouvenir>
      gastif_conversations: Table<LigneGastifConversation>
      concerts: Table<LigneConcert>
      depenses: Table<LigneDepense>
      integrations: Table<LigneIntegration>
      push_abonnements: Table<LignePushAbonnement>
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

export type LigneRecette = {
  id: string
  foyer_id: string
  titre: string
  portions: number
  ingredients: { libelle: string; quantite: string | null; rayon: string }[]
  etapes: string | null
  tags: string[]
  image_url: string | null
  cree_le: string
}

export type LigneRepas = {
  id: string
  foyer_id: string
  date: string
  creneau: 'matin' | 'midi' | 'gouter' | 'soir'
  recette_id: string | null
  notes: string | null
  cree_le: string
}

export type LigneIdeeCadeau = {
  id: string
  foyer_id: string
  celebration_id: string | null
  libelle: string
  note: string | null
  prix: number | null
  url: string | null
  image_url: string | null
  historique_prix?: { date: string; prix: number }[]
  offert: boolean
  offert_le: string | null
  cree_par: string | null
  cree_le: string
}

export type LigneMur = {
  id: string
  foyer_id: string
  auteur_id: string | null
  type: 'note' | 'photo' | 'dessin'
  contenu: string | null
  media_url: string | null
  epingle: boolean
  expire_le: string
  cree_le: string
}

export type LigneVoyage = {
  id: string
  foyer_id: string
  titre: string
  destination: string | null
  lat: number | null
  lng: number | null
  debut: string | null
  fin: string | null
  statut: 'idee' | 'prevu' | 'en_cours' | 'termine'
  couverture_url: string | null
  checklist_maison: { libelle: string; coche: boolean }[]
  cree_le: string
}

export type LigneReservation = {
  id: string
  voyage_id: string
  type: 'hebergement' | 'transport' | 'location' | 'activite' | 'restaurant' | 'autre'
  fournisseur: string | null
  reference: string | null
  debut_a: string | null
  fin_a: string | null
  adresse: string | null
  prix: number | null
  codes_acces: string | null
  doc_path: string | null
  email_brut: string | null
  cree_le: string
}

export type LigneValise = {
  id: string
  voyage_id: string
  membre_id: string
  libelle: string
  categorie: string | null
  position: number
  coche: boolean
  cree_le: string
}

export type LigneDocument = {
  id: string
  foyer_id: string
  titre: string
  type: 'identite' | 'sante' | 'assurance' | 'garantie' | 'vehicule' | 'logement' | 'ecole' | 'autre'
  membre_id: string | null
  expire_le: string | null
  file_path: string | null
  rappels: number[]
  cree_le: string
}

export type LigneColis = {
  id: string
  foyer_id: string
  transporteur: 'laposte' | 'colissimo' | 'chronopost' | 'mondial_relay' | 'ups' | 'autre'
  numero: string
  libelle: string | null
  statut: 'attendu' | 'en_transit' | 'livre' | 'probleme' | 'archive'
  dernier_evenement: Record<string, unknown> | null
  eta: string | null
  destinataire_id: string | null
  livre_le: string | null
  cree_le: string
}

export type LigneRoutine = {
  id: string
  foyer_id: string
  membre_id: string
  nom: string
  moment: 'matin' | 'soir'
  etapes: { libelle: string; icone: string; duree_secondes: number }[]
  active: boolean
  cree_le: string
}

export type LigneRoutineExecution = {
  id: string
  routine_id: string
  date: string
  etapes_faites: number[]
  terminee_le: string | null
}

export type LigneRecompense = {
  id: string
  foyer_id: string
  libelle: string
  cout_points: number
  image_url: string | null
  active: boolean
  cree_le: string
}

export type LigneRecompenseEchange = {
  id: string
  recompense_id: string
  membre_id: string
  points_depenses: number
  echange_le: string
}

export type LigneSas = {
  id: string
  foyer_id: string
  auteur_id: string | null
  type: 'photo' | 'dictee' | 'texte' | 'partage'
  media_url: string | null
  transcription: string | null
  interpretation: Record<string, unknown> | null
  statut: 'a_traiter' | 'valide' | 'ignore'
  cree_le: string
}

export type LigneSouvenir = {
  id: string
  foyer_id: string
  voyage_id: string | null
  auteur_id: string | null
  titre: string | null
  lieu: string | null
  lat: number | null
  lng: number | null
  pris_le: string
  image_donnees: string // JPEG en data-URI, recompressé côté client
  favori: boolean
  dossier: string | null
  commentaire: string | null
  cree_le: string
}

export type LigneGastifConversation = {
  id: string
  foyer_id: string
  membre_id: string
  messages: { role: 'utilisateur' | 'gastif'; texte: string; a: string }[]
  cree_le: string
  modifie_le: string
}

export type LigneConcert = {
  id: string
  foyer_id: string
  titre: string
  lieu: string | null
  date_evenement: string | null
  codes_acces: string | null
  format: string | null
  image_donnees: string | null
  notes: string | null
  cree_le: string
}

export type LigneDepense = {
  id: string
  foyer_id: string
  voyage_id: string | null
  libelle: string
  montant: number
  categorie: string | null
  date_depense: string | null
  image_donnees: string | null
  cree_le: string
}


export type LigneIntegration = {
  id: string
  foyer_id: string
  membre_id: string | null
  fournisseur: 'icloud_caldav' | 'laposte' | 'chronodrive' | 'resend_inbound' | 'anthropic'
  vault_ref: string | null
  reglages: {
    ics_url?: string
    membre_ids?: string[]
    apple_id?: string
    mdp_app?: string
    nom_calendrier?: string
  }
  statut: 'active' | 'erreur' | 'desactivee'
  derniere_sync: string | null
  cree_le: string
}

export type LignePushAbonnement = {
  id: string
  membre_id: string
  endpoint: string
  cles: Record<string, string>
  cree_le: string
}
