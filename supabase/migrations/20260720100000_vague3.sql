-- Vague 3 : le Tribunal du foyer ⚖️ et les Interviews 🎤.
-- Migration PUREMENT ADDITIVE : aucune table existante n'est touchée.

-- ⚖️ Le Tribunal du foyer : les affaires, plaidoiries et verdicts (de mauvaise
-- foi assumée) — la jurisprudence familiale se garde précieusement.
create table if not exists tribunal (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  affaire text not null,
  plaignant text not null,
  accuse text not null,
  plaidoirie_plaignant text,
  plaidoirie_accuse text,
  verdict text,
  cree_le timestamptz not null default now()
);
alter table tribunal enable row level security;
drop policy if exists tribunal_adultes on tribunal;
create policy tribunal_adultes on tribunal for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- 🎤 Les Interviews : les mêmes questions posées année après année —
-- relire les réponses de Gabriel à 7, 8, 9 ans…
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  foyer_id uuid not null references foyers(id) on delete cascade,
  personne text not null,
  question text not null,
  reponse text not null,
  annee int not null,
  cree_le timestamptz not null default now()
);
create index if not exists interviews_personne_idx on interviews (foyer_id, personne, annee);
alter table interviews enable row level security;
drop policy if exists interviews_foyer on interviews;
create policy interviews_foyer on interviews for all
  using (foyer_id = prive.foyer_courant())
  with check (foyer_id = prive.foyer_courant());

select 'Vague 3 installée : Tribunal ⚖️ + Interviews 🎤 ✓' as resultat;
