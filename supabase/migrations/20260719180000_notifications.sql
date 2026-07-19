-- La boîte à notifications : chaque envoi (push) est aussi déposé ici.
-- La cloche 🔔 de l'accueil liste les non-lues ; un tap ouvre le bon écran.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  titre text not null,
  corps text,
  url text not null default '/',
  cibles uuid[] not null default '{}',
  lu_par uuid[] not null default '{}',
  cree_le timestamptz not null default now()
);
create index if not exists notifications_foyer_idx on notifications (foyer_id, cree_le desc);
alter table notifications enable row level security;
drop policy if exists notifications_lecture on notifications;
create policy notifications_lecture on notifications for select
  using (foyer_id = prive.foyer_courant());
drop policy if exists notifications_maj on notifications;
create policy notifications_maj on notifications for update
  using (foyer_id = prive.foyer_courant())
  with check (foyer_id = prive.foyer_courant());
-- Insertion : clé service uniquement (les serveurs déposent, personne d'autre).

select 'Boîte à notifications installée ✓' as resultat;
