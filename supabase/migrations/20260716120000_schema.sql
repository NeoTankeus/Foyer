-- FOYER — schéma initial
-- Tout est en français. Stockage en UTC (timestamptz), affichage Europe/Paris côté client.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type role_membre as enum ('adult', 'child', 'guest');
create type statut_tache as enum ('a_faire', 'faite', 'annulee');
create type source_evenement as enum ('foyer', 'icloud', 'ics');
create type type_liste as enum ('courses', 'autre');
create type transporteur as enum ('laposte', 'colissimo', 'chronopost', 'mondial_relay', 'ups', 'autre');
create type statut_colis as enum ('attendu', 'en_transit', 'livre', 'probleme', 'archive');
create type creneau_repas as enum ('matin', 'midi', 'gouter', 'soir');
create type moment_routine as enum ('matin', 'soir');
create type statut_sas as enum ('a_traiter', 'valide', 'ignore');
create type type_sas as enum ('photo', 'dictee', 'texte', 'partage');
create type statut_voyage as enum ('idee', 'prevu', 'en_cours', 'termine');
create type type_reservation as enum ('hebergement', 'transport', 'location', 'activite', 'restaurant', 'autre');
create type type_mur as enum ('note', 'photo', 'dessin');
create type type_document as enum ('identite', 'sante', 'assurance', 'garantie', 'vehicule', 'logement', 'ecole', 'autre');
create type fournisseur_integration as enum ('icloud_caldav', 'laposte', 'chronodrive', 'resend_inbound', 'anthropic');
create type statut_integration as enum ('active', 'erreur', 'desactivee');
create type cible_budget as enum ('voyage', 'celebration', 'autre');

-- ---------------------------------------------------------------------------
-- Foyer & membres
-- ---------------------------------------------------------------------------

create table foyers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  fuseau text not null default 'Europe/Paris',
  reglages jsonb not null default '{}'::jsonb, -- dont reglages->'memoire' (mémoire longue de Gastif)
  cree_le timestamptz not null default now()
);

create table membres (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email_invitation text unique, -- rapprochement automatique à la première connexion
  prenom text not null,
  naissance date,
  role role_membre not null default 'adult',
  couleur text not null default 'ambre', -- ambre | sauge | ardoise | prune | corail | or
  avatar_url text,
  points integer not null default 0 check (points >= 0),
  modules_autorises text[] not null default '{}', -- liste blanche des invités
  actif_jusqu_au timestamptz, -- expiration des invités, null = permanent
  cree_le timestamptz not null default now()
);

create index membres_foyer_idx on membres (foyer_id);
create index membres_auth_idx on membres (auth_user_id);

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------

create table evenements (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  debut_a timestamptz not null,
  fin_a timestamptz not null,
  journee_entiere boolean not null default false,
  lieu text,
  notes text,
  categorie text,
  visible_enfant boolean not null default true, -- faux = jamais montré au rôle child (RLS)
  source source_evenement not null default 'foyer',
  source_id text, -- UID CalDAV / ICS
  sync_token text,
  participants uuid[] not null default '{}', -- membres.id ; vide = tout le foyer
  cree_par uuid references membres(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (fin_a >= debut_a)
);

create index evenements_foyer_periode_idx on evenements (foyer_id, debut_a, fin_a);
create unique index evenements_source_idx on evenements (foyer_id, source, source_id) where source_id is not null;

-- ---------------------------------------------------------------------------
-- Tâches & charge mentale
-- ---------------------------------------------------------------------------

create table taches (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  assignee_id uuid references membres(id) on delete set null,
  echeance date,
  rrule text, -- RFC 5545, null = ponctuelle
  statut statut_tache not null default 'a_faire',
  categorie text,
  effort_minutes integer not null default 5 check (effort_minutes > 0), -- la charge invisible compte aussi
  points integer not null default 0 check (points >= 0),
  groupe_rotation text, -- les tâches d'un même groupe tournent entre adultes
  faite_par uuid references membres(id) on delete set null,
  faite_le timestamptz,
  cree_par uuid references membres(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create index taches_foyer_statut_idx on taches (foyer_id, statut, echeance);
create index taches_assignee_idx on taches (assignee_id) where statut = 'a_faire';
create index taches_equilibre_idx on taches (foyer_id, faite_par, faite_le) where statut = 'faite';

-- ---------------------------------------------------------------------------
-- Courses & repas
-- ---------------------------------------------------------------------------

create table listes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  type type_liste not null default 'courses',
  nom text not null,
  cible_drive text, -- adaptateur drive visé (ex. 'chronodrive'), null = liste libre
  cree_le timestamptz not null default now()
);

create index listes_foyer_idx on listes (foyer_id);

create table articles (
  id uuid primary key default gen_random_uuid(),
  liste_id uuid not null references listes(id) on delete cascade,
  libelle text not null,
  quantite numeric,
  unite text,
  rayon text not null default 'divers',
  coche boolean not null default false,
  coche_par uuid references membres(id) on delete set null,
  position integer not null default 0,
  ref_produit text, -- correspondance produit_local ↔ ref drive, apprise à l'usage
  ajoute_par uuid references membres(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create index articles_liste_idx on articles (liste_id, coche, position);

create table recettes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  portions integer not null default 3,
  ingredients jsonb not null default '[]'::jsonb, -- [{libelle, quantite, unite, rayon}]
  etapes text,
  tags text[] not null default '{}',
  image_url text,
  cree_le timestamptz not null default now()
);

create index recettes_foyer_idx on recettes (foyer_id);

create table repas (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  date date not null,
  creneau creneau_repas not null default 'soir',
  recette_id uuid references recettes(id) on delete set null,
  notes text, -- repas sans recette (« restes », « pizza »)
  cree_le timestamptz not null default now(),
  unique (foyer_id, date, creneau)
);

-- ---------------------------------------------------------------------------
-- Célébrations, idées cadeaux (verrou Père Noël), budgets
-- ---------------------------------------------------------------------------

create table celebrations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  nom text not null, -- on fête aussi la mamie sans compte
  date date not null,
  relation text,
  rappels integer[] not null default '{21,7,1,0}', -- jours avant
  magie boolean not null default false, -- vrai = invisible au rôle child (RLS)
  membre_id uuid references membres(id) on delete set null, -- si la personne fêtée est un membre
  cree_le timestamptz not null default now()
);

create index celebrations_foyer_idx on celebrations (foyer_id, date);

create table idees_cadeaux (
  -- Table séparée exprès : le coffre à idées est TOUJOURS invisible au rôle child.
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  celebration_id uuid references celebrations(id) on delete cascade,
  libelle text not null,
  note text, -- « Gabriel a parlé du set Lego Ninjago — 14/03 »
  prix numeric,
  offert boolean not null default false, -- historique → plus de doublon
  offert_le date,
  cree_par uuid references membres(id) on delete set null,
  cree_le timestamptz not null default now()
);

create index idees_cadeaux_foyer_idx on idees_cadeaux (foyer_id, celebration_id);

create table budgets (
  -- Table séparée exprès : le brief interdit les colonnes budget au rôle child,
  -- et la RLS protège des lignes, pas des colonnes.
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  cible_type cible_budget not null,
  cible_id uuid not null,
  montant_prevu numeric,
  montant_reel numeric,
  notes text,
  cree_le timestamptz not null default now(),
  unique (cible_type, cible_id)
);

create index budgets_foyer_idx on budgets (foyer_id);

-- ---------------------------------------------------------------------------
-- Colis (adultes uniquement : un colis « Lego » en décembre casse la magie)
-- ---------------------------------------------------------------------------

create table colis (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  transporteur transporteur not null default 'laposte',
  numero text not null,
  libelle text,
  statut statut_colis not null default 'attendu',
  dernier_evenement jsonb,
  eta timestamptz,
  destinataire_id uuid references membres(id) on delete set null,
  livre_le timestamptz,
  cree_le timestamptz not null default now(),
  unique (foyer_id, transporteur, numero)
);

create index colis_foyer_statut_idx on colis (foyer_id, statut);

-- ---------------------------------------------------------------------------
-- Voyages
-- ---------------------------------------------------------------------------

create table voyages (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  destination text,
  lat double precision,
  lng double precision,
  debut date,
  fin date,
  statut statut_voyage not null default 'prevu',
  couverture_url text,
  checklist_maison jsonb not null default '[]'::jsonb, -- courrier, plantes, volets…
  cree_le timestamptz not null default now()
);

create index voyages_foyer_idx on voyages (foyer_id, debut);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyages(id) on delete cascade,
  type type_reservation not null,
  fournisseur text,
  reference text,
  debut_a timestamptz,
  fin_a timestamptz,
  adresse text,
  prix numeric,
  codes_acces text,
  doc_path text, -- pièce jointe dans Storage
  email_brut text, -- source parsée par Gastif (Sas ou email entrant plus tard)
  cree_le timestamptz not null default now()
);

create index reservations_voyage_idx on reservations (voyage_id, debut_a);

create table valise (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references voyages(id) on delete cascade,
  membre_id uuid not null references membres(id) on delete cascade,
  libelle text not null,
  categorie text,
  position integer not null default 0, -- le doudou est en position 1
  coche boolean not null default false,
  cree_le timestamptz not null default now()
);

create index valise_voyage_membre_idx on valise (voyage_id, membre_id);

-- ---------------------------------------------------------------------------
-- Le Coffre (documents — jamais child ni guest)
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  type type_document not null default 'autre',
  membre_id uuid references membres(id) on delete set null,
  expire_le date, -- rappel automatique à J-60
  file_path text,
  rappels integer[] not null default '{60,15}',
  cree_le timestamptz not null default now()
);

create index documents_foyer_idx on documents (foyer_id, expire_le);

-- ---------------------------------------------------------------------------
-- Le Mur
-- ---------------------------------------------------------------------------

create table mur (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  auteur_id uuid references membres(id) on delete set null,
  type type_mur not null default 'note',
  contenu text,
  media_url text,
  epingle boolean not null default false,
  expire_le timestamptz not null default now() + interval '30 days', -- éphémère par défaut
  cree_le timestamptz not null default now()
);

create index mur_foyer_idx on mur (foyer_id, epingle, expire_le);

-- ---------------------------------------------------------------------------
-- Routines & récompenses (mode enfant)
-- ---------------------------------------------------------------------------

create table routines (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  membre_id uuid not null references membres(id) on delete cascade,
  nom text not null,
  moment moment_routine not null,
  etapes jsonb not null default '[]'::jsonb, -- [{libelle, icone, duree_secondes}]
  active boolean not null default true,
  cree_le timestamptz not null default now()
);

create table routine_executions (
  -- La définition est stable ; ce qui a été coché un matin donné vit ici.
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  date date not null,
  etapes_faites integer[] not null default '{}', -- index des étapes cochées
  terminee_le timestamptz,
  unique (routine_id, date)
);

create table recompenses (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  libelle text not null, -- « choisir le film du samedi »
  cout_points integer not null check (cout_points > 0),
  image_url text,
  active boolean not null default true,
  cree_le timestamptz not null default now()
);

create table recompense_echanges (
  id uuid primary key default gen_random_uuid(),
  recompense_id uuid not null references recompenses(id) on delete cascade,
  membre_id uuid not null references membres(id) on delete cascade,
  points_depenses integer not null,
  echange_le timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Le Sas
-- ---------------------------------------------------------------------------

create table sas (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  auteur_id uuid references membres(id) on delete set null,
  type type_sas not null,
  media_url text,
  transcription text,
  interpretation jsonb, -- proposition structurée de Gastif, en attente de validation
  statut statut_sas not null default 'a_traiter', -- rien ne se perd jamais
  cree_le timestamptz not null default now()
);

create index sas_foyer_statut_idx on sas (foyer_id, statut);

-- ---------------------------------------------------------------------------
-- Gastif
-- ---------------------------------------------------------------------------

create table gastif_conversations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  membre_id uuid not null references membres(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create index gastif_conversations_membre_idx on gastif_conversations (foyer_id, membre_id);

-- ---------------------------------------------------------------------------
-- Intégrations & push
-- ---------------------------------------------------------------------------

create table integrations (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade, -- iCloud : un par parent ; null = intégration du foyer
  fournisseur fournisseur_integration not null,
  vault_ref text, -- nom du secret dans Supabase Vault, jamais le secret lui-même
  reglages jsonb not null default '{}'::jsonb, -- mapping calendriers → membres, etc.
  statut statut_integration not null default 'active',
  derniere_sync timestamptz,
  cree_le timestamptz not null default now(),
  unique (foyer_id, fournisseur, membre_id)
);

create table push_abonnements (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid not null references membres(id) on delete cascade,
  endpoint text not null unique,
  cles jsonb not null, -- p256dh + auth
  cree_le timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Journal d'audit (écrit par triggers, lisible par les adultes, inaltérable)
-- ---------------------------------------------------------------------------

create table journal_audit (
  id bigint generated always as identity primary key,
  foyer_id uuid not null,
  acteur_id uuid,
  action text not null, -- insert | update | delete | ecrasement_sync
  cible text not null, -- table:id
  avant jsonb,
  apres jsonb,
  cree_le timestamptz not null default now()
);

create index journal_audit_foyer_idx on journal_audit (foyer_id, cree_le desc);

-- ---------------------------------------------------------------------------
-- Triggers utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.toucher_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

create trigger evenements_modifie before update on evenements
  for each row execute function public.toucher_modifie_le();
create trigger taches_modifie before update on taches
  for each row execute function public.toucher_modifie_le();
create trigger articles_modifie before update on articles
  for each row execute function public.toucher_modifie_le();
create trigger gastif_conversations_modifie before update on gastif_conversations
  for each row execute function public.toucher_modifie_le();

-- Rapprochement automatique : à la création d'un compte auth dont l'email
-- correspond à membres.email_invitation, on relie le membre.
create or replace function public.lier_membre_inscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.membres
     set auth_user_id = new.id
   where email_invitation = new.email
     and auth_user_id is null;
  return new;
end $$;

create trigger apres_inscription_auth
  after insert on auth.users
  for each row execute function public.lier_membre_inscription();
