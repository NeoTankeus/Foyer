-- Frais de voyage : tickets de caisse scannés + dépenses manuelles.
-- Adultes uniquement, comme tout ce qui touche au budget (règle du brief).
set search_path = public, extensions;

create table depenses (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  voyage_id uuid references voyages(id) on delete cascade,
  libelle text not null,
  montant numeric not null,
  categorie text,
  date_depense date,
  image_donnees text,
  cree_le timestamptz not null default now()
);

create index depenses_voyage_idx on depenses (foyer_id, voyage_id, date_depense);

alter table depenses enable row level security;

create policy depenses_adultes on depenses for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

select 'Frais de voyage installés ✓' as resultat;
