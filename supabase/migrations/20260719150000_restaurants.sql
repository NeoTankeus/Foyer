-- Les Restaurants : carnet du foyer — fiche auto (OpenStreetMap), notes à
-- nous, photos de la carte, favoris, position sur la carte mondiale.
create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  nom text not null,
  ville text,
  adresse text,
  latitude double precision,
  longitude double precision,
  telephone text,
  site text,
  cuisine text,
  note numeric,
  avis text,
  favori boolean not null default false,
  carte_photos jsonb not null default '[]'::jsonb,
  cree_le timestamptz not null default now()
);
alter table restaurants enable row level security;
drop policy if exists restaurants_foyer on restaurants;
create policy restaurants_foyer on restaurants for all
  using (foyer_id = prive.foyer_courant())
  with check (foyer_id = prive.foyer_courant());

select 'Restaurants installés ✓' as resultat;
