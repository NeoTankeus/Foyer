-- La boîte à souvenirs : photos du foyer, classables par voyage et par lieu.
-- Les images sont recompressées côté client (JPEG ~250 Ko) et stockées en base ;
-- le passage sur Supabase Storage (originaux pleine taille) viendra en phase 4.
set search_path = public, extensions;

create table souvenirs (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  voyage_id uuid references voyages(id) on delete set null,
  auteur_id uuid references membres(id) on delete set null,
  titre text,
  lieu text,
  lat double precision,
  lng double precision,
  pris_le timestamptz not null default now(),
  image_donnees text not null,
  favori boolean not null default false,
  cree_le timestamptz not null default now()
);

create index souvenirs_foyer_idx on souvenirs (foyer_id, voyage_id, pris_le desc);

alter table souvenirs enable row level security;

create policy souvenirs_lecture on souvenirs for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('voyages'));
create policy souvenirs_insertion on souvenirs for insert
  with check (foyer_id = prive.foyer_courant()
              and prive.role_courant() in ('adult', 'child')
              and auteur_id = prive.membre_courant_id());
create policy souvenirs_maj on souvenirs for update
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or auteur_id = prive.membre_courant_id()));
create policy souvenirs_suppression on souvenirs for delete
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or auteur_id = prive.membre_courant_id()));

select 'Boîte à souvenirs installée ✓' as resultat;
