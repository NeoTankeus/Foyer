-- Concerts & sorties : billets scannés hors voyages (spectacles, matchs, musées).
set search_path = public, extensions;

create table concerts (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  lieu text,
  date_evenement timestamptz,
  codes_acces text,
  format text,
  image_donnees text,
  notes text,
  cree_le timestamptz not null default now()
);

create index concerts_foyer_idx on concerts (foyer_id, date_evenement);

alter table concerts enable row level security;

create policy concerts_lecture on concerts for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('concerts'));
create policy concerts_ecriture on concerts for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

select 'Module Concerts installé ✓' as resultat;
