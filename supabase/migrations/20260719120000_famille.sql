-- Mémoire des gens (fiches proches — adultes seulement, comme les cadeaux)
create table if not exists personnes (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  prenom text not null,
  relation text,
  gouts text,
  tailles text,
  allergies text,
  notes text,
  cree_le timestamptz not null default now()
);
alter table personnes enable row level security;
drop policy if exists personnes_adultes on personnes;
create policy personnes_adultes on personnes for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- Inventaire congélo / frigo / placard (anti-gaspi, DLC)
create table if not exists inventaire (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  zone text not null default 'placard',
  libelle text not null,
  code_barres text,
  image_url text,
  quantite integer not null default 1,
  dlc date,
  cree_le timestamptz not null default now()
);
alter table inventaire enable row level security;
drop policy if exists inventaire_foyer on inventaire;
create policy inventaire_foyer on inventaire for all
  using (foyer_id = prive.foyer_courant())
  with check (foyer_id = prive.foyer_courant());

select 'Mémoire des gens + Inventaire installés ✓' as resultat;
