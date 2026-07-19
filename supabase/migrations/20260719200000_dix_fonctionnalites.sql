-- Les 10 nouvelles fonctionnalités : Jardin des habitudes, Capsules
-- temporelles et Carnet santé (le reste s'appuie sur les tables existantes).

-- 🌱 Jardin des habitudes : une graine par habitude, les jours tenus font
-- grandir la plante. Entre adultes.
create table if not exists habitudes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  membre_id uuid not null references membres(id) on delete cascade,
  nom text not null,
  emoji text not null default '🌱',
  jours text[] not null default '{}',
  cree_le timestamptz not null default now()
);
alter table habitudes enable row level security;
drop policy if exists habitudes_adultes on habitudes;
create policy habitudes_adultes on habitudes for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- 💌 Capsules temporelles : scellées jusqu'à leur date d'ouverture.
create table if not exists capsules (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  auteur_id uuid references membres(id) on delete set null,
  titre text not null,
  contenu text,
  image_donnees text,
  ouvrir_le date not null,
  ouverte boolean not null default false,
  cree_le timestamptz not null default now()
);
alter table capsules enable row level security;
drop policy if exists capsules_adultes on capsules;
create policy capsules_adultes on capsules for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- 🩺 Carnet santé : vaccins, ordonnances photographiées, mesures, rappels.
create table if not exists sante (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  personne text not null,
  type text not null default 'note',
  libelle text not null,
  date_soin date,
  rappel_le date,
  image_donnees text,
  notes text,
  cree_le timestamptz not null default now()
);
create index if not exists sante_rappel_idx on sante (foyer_id, rappel_le);
alter table sante enable row level security;
drop policy if exists sante_adultes on sante;
create policy sante_adultes on sante for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

select 'Les 10 fonctionnalités sont installées ✓' as resultat;
