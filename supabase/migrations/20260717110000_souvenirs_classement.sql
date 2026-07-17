-- Classement des souvenirs : dossiers et commentaires.
alter table souvenirs add column if not exists dossier text;
alter table souvenirs add column if not exists commentaire text;
create index if not exists souvenirs_dossier_idx on souvenirs (foyer_id, dossier);
