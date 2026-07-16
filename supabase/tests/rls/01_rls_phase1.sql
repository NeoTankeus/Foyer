-- Tests RLS phase 1 : périmètre foyer + rôles sur evenements, taches, listes, articles.
-- Exécution : supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Décor : deux foyers, un adulte + un enfant + un invité (foyer 1), un adulte (foyer 2)
-- ---------------------------------------------------------------------------

insert into foyers (id, nom) values
  ('11111111-1111-4111-8111-111111111111', 'Foyer test'),
  ('22222222-2222-4222-8222-222222222222', 'Autre foyer');

insert into membres (id, foyer_id, email_invitation, prenom, role, couleur, modules_autorises, actif_jusqu_au) values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'adulte@test.fr', 'Adulte', 'adult', 'ambre', '{}', null),
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', null, 'Gabriel', 'child', 'ardoise', '{}', null),
  ('91111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'nounou@test.fr', 'Nounou', 'guest', 'prune', '{evenements}', now() + interval '7 days'),
  ('b2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'autre@test.fr', 'Autre', 'adult', 'sauge', '{}', null);

-- Les comptes auth : le trigger apres_inscription_auth relie par email.
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'adulte@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'enfant@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'nounou@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'autre@test.fr');

-- L'enfant n'a pas d'email : liaison manuelle (comme le fera un parent).
update membres set auth_user_id = 'cccccccc-0000-4000-8000-000000000002'
  where id = 'c1111111-1111-4111-8111-111111111111';

insert into evenements (id, foyer_id, titre, debut_a, fin_a, visible_enfant) values
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Piscine', now(), now() + interval '1 hour', true),
  ('e2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Préparer la surprise', now(), now() + interval '1 hour', false),
  ('e9000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'Événement du foyer 2', now(), now() + interval '1 hour', true);

insert into taches (id, foyer_id, titre, assignee_id, statut) values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ranger sa chambre', 'c1111111-1111-4111-8111-111111111111', 'a_faire'),
  ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Acheter le cadeau de Gabriel', 'a1111111-1111-4111-8111-111111111111', 'a_faire');

insert into listes (id, foyer_id, type, nom) values
  ('a0000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'courses', 'Courses');
insert into articles (id, liste_id, libelle, rayon) values
  ('a0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000a', 'Lait', 'crèmerie');

-- ---------------------------------------------------------------------------
-- Adulte du foyer 1
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 2, 'adulte : voit les 2 événements de son foyer, pas ceux du foyer 2');
select is((select count(*)::int from taches), 2, 'adulte : voit toutes les tâches du foyer');
select lives_ok(
  $$insert into evenements (foyer_id, titre, debut_a, fin_a)
    values ('11111111-1111-4111-8111-111111111111', 'Dîner', now(), now() + interval '2 hours')$$,
  'adulte : peut créer un événement');
select is((select count(*)::int from evenements), 3, 'adulte : voit l''événement créé');

-- ---------------------------------------------------------------------------
-- Enfant
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"cccccccc-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 2, 'enfant : ne voit que les événements visible_enfant');
select is((select count(*)::int from taches), 1, 'enfant : ne voit que les tâches qui lui sont assignées');
select is((select count(*)::int from taches where id = 'f2000000-0000-4000-8000-000000000002'), 0,
  'enfant : « acheter le cadeau de Gabriel » ne lui apparaît jamais');
select throws_ok(
  $$insert into evenements (foyer_id, titre, debut_a, fin_a)
    values ('11111111-1111-4111-8111-111111111111', 'Essai', now(), now())$$,
  '42501', null, 'enfant : ne peut pas créer d''événement');
select lives_ok(
  $$update taches set statut = 'faite', faite_par = 'c1111111-1111-4111-8111-111111111111', faite_le = now()
    where id = 'f1000000-0000-4000-8000-000000000001'$$,
  'enfant : peut cocher sa propre tâche');
select is((select statut::text from taches where id = 'f1000000-0000-4000-8000-000000000001'), 'faite',
  'enfant : sa tâche est bien passée à « faite »');
select lives_ok(
  $$update articles set coche = true where id = 'a0000000-0000-4000-8000-00000000000b'$$,
  'enfant : peut cocher un article (mode magasin)');
select is((select coche from articles where id = 'a0000000-0000-4000-8000-00000000000b'), true,
  'enfant : l''article est bien coché');
select throws_ok(
  $$insert into articles (liste_id, libelle, rayon)
    values ('a0000000-0000-4000-8000-00000000000a', 'Bonbons', 'épicerie sucrée')$$,
  '42501', null, 'enfant : ne peut pas ajouter d''article');

-- ---------------------------------------------------------------------------
-- Invité actif (liste blanche : evenements uniquement)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 3, 'invité actif : voit les événements (module autorisé)');
select is((select count(*)::int from taches), 0, 'invité : aucune tâche (module non autorisé)');
select is((select count(*)::int from articles), 0, 'invité : aucun article (module non autorisé)');
select throws_ok(
  $$insert into evenements (foyer_id, titre, debut_a, fin_a)
    values ('11111111-1111-4111-8111-111111111111', 'Essai', now(), now())$$,
  '42501', null, 'invité : lecture seule, jamais d''écriture');

-- ---------------------------------------------------------------------------
-- Adulte du foyer 2 : isolation entre foyers
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 1, 'foyer 2 : ne voit que ses propres événements');
select is((select count(*)::int from articles), 0, 'foyer 2 : ne voit pas les articles du foyer 1');

select * from finish();
rollback;
