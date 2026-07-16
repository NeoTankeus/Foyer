-- Reproduit l'environnement Supabase minimal (rôles, schéma auth, realtime)
-- pour exécuter les migrations et les tests RLS sur un Postgres nu (CI, local).
-- Sur un vrai projet Supabase, tout ceci existe déjà.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar,
  role varchar,
  email varchar unique,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid
language sql stable as
$$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
