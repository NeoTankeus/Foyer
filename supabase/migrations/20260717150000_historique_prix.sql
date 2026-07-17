-- Historique des prix des cadeaux (courbe + alerte de baisse).
alter table idees_cadeaux add column if not exists historique_prix jsonb not null default '[]'::jsonb;
