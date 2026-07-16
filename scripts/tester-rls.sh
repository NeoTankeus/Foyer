#!/usr/bin/env bash
# Tests RLS : cluster Postgres jetable → stub Supabase → migrations → seed → pgTAP.
# Prérequis : postgresql-16 (ou +) et postgresql-16-pgtap installés.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$BIN" ] || { echo "PostgreSQL introuvable (apt install postgresql postgresql-16-pgtap)"; exit 1; }

DIR="$(mktemp -d)"
trap 'if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$BIN/pg_ctl -D $DIR/pgdata stop -m immediate" >/dev/null 2>&1 || true; else "$BIN/pg_ctl" -D "$DIR/pgdata" stop -m immediate >/dev/null 2>&1 || true; fi; rm -rf "$DIR"' EXIT

mkdir -p "$DIR/pgdata" "$DIR/pgsock"

demarrer() {
  "$BIN/initdb" -U postgres --auth=trust -E UTF8 "$DIR/pgdata" >/dev/null
  "$BIN/pg_ctl" -D "$DIR/pgdata" -o "-k $DIR/pgsock -c listen_addresses='' -c wal_level=logical" \
    -l "$DIR/pg.log" start >/dev/null
}

if [ "$(id -u)" = 0 ]; then
  chown -R postgres:postgres "$DIR"
  export -f demarrer
  su postgres -s /bin/bash -c "BIN=$BIN DIR=$DIR bash -c demarrer"
else
  demarrer
fi

PSQL=("$BIN/psql" -U postgres -h "$DIR/pgsock" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "create database foyer;"
"${PSQL[@]}" -c "alter database foyer set search_path = public, extensions;"
"${PSQL[@]}" -d foyer -f "$RACINE/supabase/tests/environnement-test.sql"
for migration in "$RACINE"/supabase/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  "${PSQL[@]}" -d foyer -f "$migration"
done
echo "→ seed.sql"
"${PSQL[@]}" -d foyer -f "$RACINE/supabase/seed.sql"

echec=0
for test in "$RACINE"/supabase/tests/rls/*.sql; do
  echo "═══ $(basename "$test")"
  sortie="$("$BIN/psql" -U postgres -h "$DIR/pgsock" -d foyer -f "$test" 2>&1)" || echec=1
  echo "$sortie" | grep -E '^\s*(not )?ok|# |ERROR|Looks like' || true
  if echo "$sortie" | grep -qE 'not ok|ERROR'; then echec=1; fi
done

if [ "$echec" = 1 ]; then
  echo "✗ Des tests RLS échouent."
  exit 1
fi
echo "✓ Tous les tests RLS passent."
