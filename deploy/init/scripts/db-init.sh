#!/usr/bin/env bash
# Creates one database + login role per service (least privilege, no access to
# other services' databases), enables required extensions and applies dbmate
# migrations. Idempotent: safe to run on every `docker compose up`.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="db-init"

export PGHOST="${PGHOST:-postgres}" PGPORT="${PGPORT:-5432}" PGUSER=postgres PGDATABASE=postgres
PGPASSWORD="$(secret postgres_superuser_password)"; export PGPASSWORD
retry 30 pg_isready -q || die "postgres not ready"

psql_q() { psql -v ON_ERROR_STOP=1 -qAt "$@"; }

ensure_db() { # <db> <role> <password> <extensions...>
  local db="$1" role="$2" pw="$3"; shift 3
  psql_q -v role="$role" -v pw="$pw" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'role', :'pw')
\gexec
SQL
  psql_q -v db="$db" -v role="$role" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO postgres_monitor', :'db')
\gexec
SQL
  psql_q -d "$db" -v role="$role" <<'SQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'role')
\gexec
SQL
  for ext in "$@"; do psql_q -d "$db" -c "CREATE EXTENSION IF NOT EXISTS \"${ext}\""; done
}

# Monitoring role used by the OpenTelemetry collector's postgresql receiver.
psql_q -v pw="$(secret postgres_monitor_password)" <<'SQL'
SELECT 'CREATE ROLE postgres_monitor LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres_monitor')
\gexec
SELECT format('ALTER ROLE postgres_monitor WITH LOGIN PASSWORD %L', :'pw')
\gexec
GRANT pg_monitor TO postgres_monitor;
SQL

for db in $(jq -r '.infraDatabases | keys[]' "$MANIFEST"); do
  owner=$(jq -r --arg d "$db" '.infraDatabases[$d].owner' "$MANIFEST")
  pw="$(secret "$(jq -r --arg d "$db" '.infraDatabases[$d].password' "$MANIFEST")")"
  mapfile -t exts < <(jq -r --arg d "$db" '.infraDatabases[$d].extensions[]' "$MANIFEST")
  ensure_db "$db" "$owner" "$pw" "${exts[@]}"
  info "database ${db} ready"
done

for svc in $(jq -r '.services | to_entries[] | select(.value.database) | .key' "$MANIFEST"); do
  db=$(jq -r --arg s "$svc" '.services[$s].database' "$MANIFEST")
  pw="$(secret "$(jq -r --arg s "$svc" '.services[$s].openbao.db_password' "$MANIFEST")")"
  mapfile -t exts < <(jq -r --arg s "$svc" '.services[$s].extensions // [] | .[]' "$MANIFEST")
  ensure_db "$db" "$db" "$pw" "${exts[@]}"

  mig="/opt/raadi/migrations/$(jq -r --arg s "$svc" '.services[$s].migrations // $s' "$MANIFEST")"
  if [[ -d "$mig" ]]; then
    DATABASE_URL="postgres://${db}:${pw}@${PGHOST}:${PGPORT}/${db}?sslmode=disable" \
      dbmate --migrations-dir "$mig" --no-dump-schema --wait up >/dev/null
    applied=$(PGPASSWORD="$pw" psql_q -U "$db" -d "$db" -c 'SELECT count(*) FROM schema_migrations')
    info "database ${db} migrated (${applied} migration(s) applied)"
  fi
done
