-- Le verrou Père Noël + le Coffre + l'expiration des invités.
-- Une faille ici, c'est Gabriel qui découvre ses cadeaux de Noël. Zéro tolérance.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into foyers (id, nom) values ('11111111-1111-4111-8111-111111111111', 'Foyer test');

insert into membres (id, foyer_id, email_invitation, prenom, role, couleur, modules_autorises, actif_jusqu_au) values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'adulte@test.fr', 'Adulte', 'adult', 'ambre', '{}', null),
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', null, 'Gabriel', 'child', 'ardoise', '{}', null),
  ('91111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'actif@test.fr', 'Nounou', 'guest', 'prune', '{evenements}', now() + interval '7 days'),
  ('92222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'expire@test.fr', 'Ancien', 'guest', 'corail', '{evenements}', now() - interval '1 day');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'adulte@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'enfant@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'actif@test.fr'),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'expire@test.fr');

update membres set auth_user_id = 'cccccccc-0000-4000-8000-000000000002'
  where id = 'c1111111-1111-4111-8111-111111111111';

insert into evenements (id, foyer_id, titre, debut_a, fin_a) values
  ('e1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Piscine', now(), now() + interval '1 hour');

insert into celebrations (id, foyer_id, nom, date, magie) values
  ('ce100000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Anniversaire de mamie', '1950-03-12', false),
  ('ce200000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Noël de Gabriel', '2026-12-25', true);

insert into idees_cadeaux (id, foyer_id, celebration_id, libelle, note) values
  ('1dee0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ce200000-0000-4000-8000-000000000002', 'Set Lego Ninjago', 'Il en a parlé le 14/03');

insert into budgets (id, foyer_id, cible_type, cible_id, montant_prevu) values
  ('b0d90000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'celebration', 'ce200000-0000-4000-8000-000000000002', 120);

insert into colis (id, foyer_id, transporteur, numero, libelle) values
  ('c0110000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'laposte', '6A12345678901', 'Lego Ninjago');

insert into documents (id, foyer_id, titre, type) values
  ('d0c00000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Passeport Gabriel', 'identite');

-- ---------------------------------------------------------------------------
-- Adulte : accès complet
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from celebrations), 2, 'adulte : voit toutes les célébrations');
select is((select count(*)::int from idees_cadeaux), 1, 'adulte : voit le coffre à idées');
select is((select count(*)::int from budgets), 1, 'adulte : voit les budgets');
select is((select count(*)::int from colis), 1, 'adulte : voit les colis');
select is((select count(*)::int from documents), 1, 'adulte : voit le Coffre');
select ok((select count(*) >= 2 from journal_audit), 'adulte : le journal d''audit trace les tables sensibles');

-- ---------------------------------------------------------------------------
-- Enfant : le verrou Père Noël
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"cccccccc-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from celebrations), 1, 'enfant : ne voit que les célébrations sans magie');
select is((select count(*)::int from celebrations where magie), 0, 'enfant : AUCUNE célébration magie, jamais');
select is((select count(*)::int from idees_cadeaux), 0, 'enfant : le coffre à idées est invisible');
select is((select count(*)::int from budgets), 0, 'enfant : aucun budget visible');
select is((select count(*)::int from colis), 0, 'enfant : aucun colis visible (le Lego reste secret)');
select is((select count(*)::int from documents), 0, 'enfant : le Coffre est invisible');
select is((select count(*)::int from journal_audit), 0, 'enfant : le journal d''audit est invisible');
select throws_ok(
  $$insert into idees_cadeaux (foyer_id, libelle) values ('11111111-1111-4111-8111-111111111111', 'essai')$$,
  '42501', null, 'enfant : ne peut rien écrire dans le coffre à idées');

-- ---------------------------------------------------------------------------
-- Invité actif : liste blanche seulement, jamais le Coffre
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"dddddddd-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 1, 'invité actif : voit les événements (module autorisé)');
select is((select count(*)::int from documents), 0, 'invité : jamais le Coffre');

-- ---------------------------------------------------------------------------
-- Invité expiré : plus rien, même les modules autorisés
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{"sub":"eeeeeeee-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from evenements), 0, 'invité expiré : plus aucun événement');
select is((select count(*)::int from celebrations), 0, 'invité expiré : plus rien du tout');

select * from finish();
rollback;
