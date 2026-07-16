-- FOYER — Row Level Security
--
-- Principe en deux couches :
--   1. une policy permissive de périmètre (le foyer + les droits de lecture du rôle),
--   2. des policies RESTRICTIVES par rôle (enfant, invité) qui s'ajoutent en ET logique.
-- Une faille exige de rater les deux couches.
--
-- Le verrou Père Noël est ici, pas dans le front.

-- ---------------------------------------------------------------------------
-- Helpers (schéma privé, jamais exposé à PostgREST)
-- ---------------------------------------------------------------------------

create schema if not exists prive;
revoke all on schema prive from public;
grant usage on schema prive to authenticated;

create or replace function prive.membre_courant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.membres where auth_user_id = (select auth.uid());
$$;

create or replace function prive.foyer_courant()
returns uuid language sql stable security definer set search_path = public as $$
  select foyer_id from public.membres where auth_user_id = (select auth.uid());
$$;

create or replace function prive.role_courant()
returns role_membre language sql stable security definer set search_path = public as $$
  select role from public.membres where auth_user_id = (select auth.uid());
$$;

create or replace function prive.est_adulte()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(prive.role_courant() = 'adult', false);
$$;

-- Lecture d'un module : adulte et enfant → oui ; invité → seulement si son accès
-- n'est pas expiré ET que le module figure dans sa liste blanche.
create or replace function prive.lecture_autorisee(module text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case m.role
      when 'guest' then coalesce(m.actif_jusqu_au > now(), false)
                        and module = any (m.modules_autorises)
      else true
    end
    from public.membres m
    where m.auth_user_id = (select auth.uid())
  ), false);
$$;

grant execute on all functions in schema prive to authenticated;

-- ---------------------------------------------------------------------------
-- Activation de la RLS partout
-- ---------------------------------------------------------------------------

alter table foyers enable row level security;
alter table membres enable row level security;
alter table evenements enable row level security;
alter table taches enable row level security;
alter table listes enable row level security;
alter table articles enable row level security;
alter table recettes enable row level security;
alter table repas enable row level security;
alter table celebrations enable row level security;
alter table idees_cadeaux enable row level security;
alter table budgets enable row level security;
alter table colis enable row level security;
alter table voyages enable row level security;
alter table reservations enable row level security;
alter table valise enable row level security;
alter table documents enable row level security;
alter table mur enable row level security;
alter table routines enable row level security;
alter table routine_executions enable row level security;
alter table recompenses enable row level security;
alter table recompense_echanges enable row level security;
alter table sas enable row level security;
alter table gastif_conversations enable row level security;
alter table integrations enable row level security;
alter table push_abonnements enable row level security;
alter table journal_audit enable row level security;

-- ---------------------------------------------------------------------------
-- Foyer & membres
-- ---------------------------------------------------------------------------

create policy foyers_lecture on foyers for select
  using (id = prive.foyer_courant());
create policy foyers_maj on foyers for update
  using (id = prive.foyer_courant() and prive.est_adulte());

create policy membres_lecture on membres for select
  using (foyer_id = prive.foyer_courant());
create policy membres_insertion on membres for insert
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy membres_maj on membres for update
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or id = prive.membre_courant_id()));
create policy membres_suppression on membres for delete
  using (foyer_id = prive.foyer_courant() and prive.est_adulte()
         and id <> prive.membre_courant_id());

-- ---------------------------------------------------------------------------
-- Événements — l'enfant ne voit que visible_enfant ; les invités selon liste blanche
-- ---------------------------------------------------------------------------

create policy evenements_lecture on evenements for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('evenements'));
create policy evenements_ecriture on evenements for insert
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy evenements_maj on evenements for update
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy evenements_suppression on evenements for delete
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy evenements_enfant on evenements as restrictive for select
  using (prive.role_courant() <> 'child' or visible_enfant);

-- ---------------------------------------------------------------------------
-- Tâches — l'enfant ne voit QUE les tâches qui lui sont assignées
-- (« acheter le cadeau de Gabriel » ne doit jamais lui apparaître)
-- ---------------------------------------------------------------------------

create policy taches_lecture on taches for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('taches'));
create policy taches_insertion on taches for insert
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy taches_maj_adulte on taches for update
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy taches_maj_enfant on taches for update
  using (foyer_id = prive.foyer_courant()
         and prive.role_courant() = 'child'
         and assignee_id = prive.membre_courant_id())
  with check (assignee_id = prive.membre_courant_id());
create policy taches_suppression on taches for delete
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy taches_enfant on taches as restrictive for select
  using (prive.role_courant() <> 'child' or assignee_id = prive.membre_courant_id());

-- ---------------------------------------------------------------------------
-- Courses — tout le foyer lit ; l'enfant peut cocher (mode magasin) mais ni
-- ajouter ni supprimer ; Realtime respecte ces mêmes policies
-- ---------------------------------------------------------------------------

create policy listes_lecture on listes for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('courses'));
create policy listes_ecriture on listes for insert
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy listes_maj on listes for update
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy listes_suppression on listes for delete
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy articles_lecture on articles for select
  using (exists (select 1 from listes l where l.id = liste_id
                 and l.foyer_id = prive.foyer_courant())
         and prive.lecture_autorisee('courses'));
create policy articles_insertion on articles for insert
  with check (exists (select 1 from listes l where l.id = liste_id
                      and l.foyer_id = prive.foyer_courant())
              and prive.est_adulte());
create policy articles_maj on articles for update
  using (exists (select 1 from listes l where l.id = liste_id
                 and l.foyer_id = prive.foyer_courant())
         and prive.role_courant() in ('adult', 'child'));
create policy articles_suppression on articles for delete
  using (exists (select 1 from listes l where l.id = liste_id
                 and l.foyer_id = prive.foyer_courant())
         and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Recettes & repas — lecture foyer, écriture adulte
-- ---------------------------------------------------------------------------

create policy recettes_lecture on recettes for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('repas'));
create policy recettes_ecriture on recettes for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy repas_lecture on repas for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('repas'));
create policy repas_ecriture on repas for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Célébrations — l'enfant ne voit jamais magie = true.
-- Idées cadeaux & budgets — ADULTES UNIQUEMENT. Le verrou Père Noël.
-- ---------------------------------------------------------------------------

create policy celebrations_lecture on celebrations for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('celebrations'));
create policy celebrations_ecriture on celebrations for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy celebrations_enfant on celebrations as restrictive for select
  using (prive.role_courant() <> 'child' or magie = false);

create policy idees_cadeaux_adultes on idees_cadeaux for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy budgets_adultes on budgets for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Colis — adultes uniquement (un colis « Lego » en décembre casse la magie)
-- ---------------------------------------------------------------------------

create policy colis_adultes on colis for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Voyages — lecture foyer ; la valise de l'enfant est cochable par lui
-- ---------------------------------------------------------------------------

create policy voyages_lecture on voyages for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('voyages'));
create policy voyages_ecriture on voyages for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy reservations_lecture on reservations for select
  using (exists (select 1 from voyages v where v.id = voyage_id
                 and v.foyer_id = prive.foyer_courant())
         and prive.lecture_autorisee('voyages'));
create policy reservations_ecriture on reservations for all
  using (exists (select 1 from voyages v where v.id = voyage_id
                 and v.foyer_id = prive.foyer_courant()) and prive.est_adulte())
  with check (exists (select 1 from voyages v where v.id = voyage_id
                      and v.foyer_id = prive.foyer_courant()) and prive.est_adulte());

create policy valise_lecture on valise for select
  using (exists (select 1 from voyages v where v.id = voyage_id
                 and v.foyer_id = prive.foyer_courant())
         and prive.lecture_autorisee('voyages'));
create policy valise_ecriture_adulte on valise for all
  using (exists (select 1 from voyages v where v.id = voyage_id
                 and v.foyer_id = prive.foyer_courant()) and prive.est_adulte())
  with check (exists (select 1 from voyages v where v.id = voyage_id
                      and v.foyer_id = prive.foyer_courant()) and prive.est_adulte());
create policy valise_coche_enfant on valise for update
  using (prive.role_courant() = 'child' and membre_id = prive.membre_courant_id())
  with check (membre_id = prive.membre_courant_id());

create policy valise_enfant on valise as restrictive for select
  using (prive.role_courant() <> 'child' or membre_id = prive.membre_courant_id());

-- ---------------------------------------------------------------------------
-- Le Coffre — adultes uniquement, jamais child ni guest
-- ---------------------------------------------------------------------------

create policy documents_adultes on documents for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Le Mur — tout le foyer lit, tout le monde poste, chacun gère ses propres posts
-- ---------------------------------------------------------------------------

create policy mur_lecture on mur for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('mur'));
create policy mur_insertion on mur for insert
  with check (foyer_id = prive.foyer_courant()
              and prive.role_courant() in ('adult', 'child')
              and auteur_id = prive.membre_courant_id());
create policy mur_maj on mur for update
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or auteur_id = prive.membre_courant_id()));
create policy mur_suppression on mur for delete
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or auteur_id = prive.membre_courant_id()));

-- ---------------------------------------------------------------------------
-- Routines — l'enfant voit et exécute les siennes ; la nounou (guest) peut les lire
-- ---------------------------------------------------------------------------

create policy routines_lecture on routines for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('routines'));
create policy routines_ecriture on routines for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy routines_enfant on routines as restrictive for select
  using (prive.role_courant() <> 'child' or membre_id = prive.membre_courant_id());

create policy routine_executions_lecture on routine_executions for select
  using (exists (select 1 from routines r where r.id = routine_id
                 and r.foyer_id = prive.foyer_courant())
         and prive.lecture_autorisee('routines'));
create policy routine_executions_ecriture on routine_executions for insert
  with check (exists (select 1 from routines r where r.id = routine_id
                      and r.foyer_id = prive.foyer_courant()
                      and (prive.est_adulte() or r.membre_id = prive.membre_courant_id())));
create policy routine_executions_maj on routine_executions for update
  using (exists (select 1 from routines r where r.id = routine_id
                 and r.foyer_id = prive.foyer_courant()
                 and (prive.est_adulte() or r.membre_id = prive.membre_courant_id())));

-- ---------------------------------------------------------------------------
-- Récompenses — catalogue lisible par le foyer ; échanges : chacun les siens
-- ---------------------------------------------------------------------------

create policy recompenses_lecture on recompenses for select
  using (foyer_id = prive.foyer_courant() and prive.lecture_autorisee('recompenses'));
create policy recompenses_ecriture on recompenses for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy recompense_echanges_lecture on recompense_echanges for select
  using (exists (select 1 from recompenses r where r.id = recompense_id
                 and r.foyer_id = prive.foyer_courant())
         and (prive.est_adulte() or membre_id = prive.membre_courant_id()));
create policy recompense_echanges_insertion on recompense_echanges for insert
  with check (exists (select 1 from recompenses r where r.id = recompense_id
                      and r.foyer_id = prive.foyer_courant())
              and prive.role_courant() in ('adult', 'child')
              and (prive.est_adulte() or membre_id = prive.membre_courant_id()));

-- ---------------------------------------------------------------------------
-- Le Sas — chacun voit et crée les siens ; les adultes voient tout
-- ---------------------------------------------------------------------------

create policy sas_lecture on sas for select
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or auteur_id = prive.membre_courant_id()));
create policy sas_insertion on sas for insert
  with check (foyer_id = prive.foyer_courant()
              and prive.role_courant() in ('adult', 'child')
              and auteur_id = prive.membre_courant_id());
create policy sas_maj on sas for update
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());
create policy sas_suppression on sas for delete
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());

-- ---------------------------------------------------------------------------
-- Gastif — chacun sa conversation ; les adultes peuvent relire celles du foyer
-- (l'enfant ne voit JAMAIS les conversations des parents)
-- ---------------------------------------------------------------------------

create policy gastif_lecture on gastif_conversations for select
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or membre_id = prive.membre_courant_id()));
create policy gastif_insertion on gastif_conversations for insert
  with check (foyer_id = prive.foyer_courant()
              and prive.role_courant() in ('adult', 'child')
              and membre_id = prive.membre_courant_id());
create policy gastif_maj on gastif_conversations for update
  using (foyer_id = prive.foyer_courant()
         and (prive.est_adulte() or membre_id = prive.membre_courant_id()));

-- ---------------------------------------------------------------------------
-- Intégrations & journal — adultes uniquement ; le journal est inaltérable
-- ---------------------------------------------------------------------------

create policy integrations_adultes on integrations for all
  using (foyer_id = prive.foyer_courant() and prive.est_adulte())
  with check (foyer_id = prive.foyer_courant() and prive.est_adulte());

create policy push_abonnements_soi on push_abonnements for all
  using (membre_id = prive.membre_courant_id())
  with check (membre_id = prive.membre_courant_id());

create policy journal_audit_lecture on journal_audit for select
  using (foyer_id = prive.foyer_courant() and prive.est_adulte());
-- Aucune policy INSERT/UPDATE/DELETE : seul le trigger SECURITY DEFINER écrit.

-- ---------------------------------------------------------------------------
-- Journalisation des tables sensibles (écrit même si l'acteur n'a pas accès au journal)
-- ---------------------------------------------------------------------------

create or replace function prive.journaliser()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_foyer uuid;
begin
  v_foyer := coalesce(new.foyer_id, old.foyer_id);
  insert into journal_audit (foyer_id, acteur_id, action, cible, avant, apres)
  values (
    v_foyer,
    prive.membre_courant_id(),
    lower(tg_op),
    tg_table_name || ':' || coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger documents_journal after insert or update or delete on documents
  for each row execute function prive.journaliser();
create trigger idees_cadeaux_journal after insert or update or delete on idees_cadeaux
  for each row execute function prive.journaliser();
create trigger integrations_journal after insert or update or delete on integrations
  for each row execute function prive.journaliser();
create trigger evenements_journal after update or delete on evenements
  for each row execute function prive.journaliser(); -- journal des écrasements de sync

-- ---------------------------------------------------------------------------
-- Realtime (les policies RLS s'appliquent aussi aux flux temps réel)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table articles;
alter publication supabase_realtime add table listes;
alter publication supabase_realtime add table taches;
alter publication supabase_realtime add table evenements;
alter publication supabase_realtime add table mur;
