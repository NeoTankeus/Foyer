-- FOYER — données de départ
-- À ajuster : prénoms et emails réels des deux adultes avant la première connexion.
-- Le trigger apres_inscription_auth relie automatiquement chaque compte créé
-- (par email) à son membre pré-déclaré ici.

insert into foyers (id, nom, fuseau, reglages)
values (
  '00000000-0000-4000-8000-000000000001',
  'Notre foyer',
  'Europe/Paris',
  '{"memoire": ""}'::jsonb
);

insert into membres (foyer_id, email_invitation, prenom, naissance, role, couleur)
values
  ('00000000-0000-4000-8000-000000000001', 'stephanefoloneo@gmail.com', 'Adulte 1', null, 'adult', 'ambre'),
  ('00000000-0000-4000-8000-000000000001', 'adulte2@remplacer.fr',      'Adulte 2', null, 'adult', 'sauge'),
  ('00000000-0000-4000-8000-000000000001', null, 'Gabriel', '2019-06-27', 'child', 'ardoise');

insert into listes (foyer_id, type, nom)
values ('00000000-0000-4000-8000-000000000001', 'courses', 'Courses');

insert into celebrations (foyer_id, nom, date, relation, membre_id, magie)
select '00000000-0000-4000-8000-000000000001', 'Anniversaire de Gabriel', '2019-06-27', 'enfant', m.id, false
from membres m where m.prenom = 'Gabriel';
