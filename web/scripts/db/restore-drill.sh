#!/usr/bin/env bash
# Restore drill: prove a backup file actually restores.
#
#   web/scripts/db/restore-drill.sh <dump.dump | dump.dump.gpg> [--keep]
#
# Restores into a throwaway database (drill_<timestamp>) on the LOCAL Supabase
# Docker stack, prints sanity counts, then drops the database unless --keep.
# It refuses any database host other than 127.0.0.1 / localhost, and it never
# downloads anything. Fetch the artifact first (see BACKUPS.md).
#
# Env:
#   BACKUP_PASSPHRASE  passphrase for a .gpg file (prompted if unset)
#   DRILL_DB_URL       admin connection, default postgres://postgres:postgres@127.0.0.1:64322/postgres
#   DRILL_CONTAINER    Docker container to fall back to when the host has no
#                      pg_restore/psql (default supabase_db_90X)
set -euo pipefail

usage() { echo "usage: $0 <dump.dump|dump.dump.gpg> [--keep]" >&2; exit 2; }

FILE=""
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    -h|--help) usage ;;
    -*) echo "unknown flag: $arg" >&2; usage ;;
    *) [ -z "$FILE" ] && FILE="$arg" || usage ;;
  esac
done
[ -n "$FILE" ] || usage
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 2; }

ADMIN_URL="${DRILL_DB_URL:-postgres://postgres:postgres@127.0.0.1:64322/postgres}"
CONTAINER="${DRILL_CONTAINER:-supabase_db_90X}"

# Parse host/port/user/password out of the URL and refuse non-local hosts.
rest="${ADMIN_URL#*://}"
creds="${rest%%@*}"
hostpart="${rest#*@}"
hostport="${hostpart%%/*}"
HOST="${hostport%%:*}"
PORT="${hostport#*:}"; [ "$PORT" = "$hostport" ] && PORT=5432
DBUSER="${creds%%:*}"
DBPASS="${creds#*:}"
case "$HOST" in
  127.0.0.1|localhost) ;;
  *) echo "refusing to run: host '$HOST' is not 127.0.0.1/localhost" >&2; exit 2 ;;
esac

# Pick how to run Postgres tools: host binaries if both exist, else docker exec.
if command -v pg_restore >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  MODE=host
else
  command -v docker >/dev/null 2>&1 || { echo "need pg_restore+psql on PATH, or docker" >&2; exit 2; }
  docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "container $CONTAINER is not running (supabase start)" >&2; exit 2; }
  MODE=docker
fi
echo "mode: $MODE (host $HOST:$PORT)"

# Stops Git Bash rewriting arguments that look like paths when calling docker.
export MSYS_NO_PATHCONV=1

psql_db() { # psql_db <db> [psql args...]; SQL on stdin or via -c
  local db="$1"; shift
  if [ "$MODE" = host ]; then
    PGPASSWORD="$DBPASS" psql -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$db" -X -v ON_ERROR_STOP=1 "$@"
  else
    docker exec -i "$CONTAINER" psql -U "$DBUSER" -d "$db" -X -v ON_ERROR_STOP=1 "$@"
  fi
}

TMP="$(mktemp -d)"
DB="drill_$(date -u +%Y%m%d_%H%M%S)"
CREATED=0
cleanup() {
  rm -rf "$TMP"
  if [ "$CREATED" = 1 ] && [ "$KEEP" = 0 ]; then
    psql_db postgres -qc "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1 \
      && echo "dropped scratch database $DB" || echo "WARNING: could not drop $DB" >&2
  fi
}
trap cleanup EXIT

# Decrypt when needed. The plaintext lives only in a temp dir removed on exit.
DUMP="$FILE"
case "$FILE" in
  *.gpg)
    command -v gpg >/dev/null 2>&1 || { echo "gpg not found" >&2; exit 2; }
    if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
      read -r -s -p "Backup passphrase: " BACKUP_PASSPHRASE; echo
    fi
    DUMP="$TMP/backup.dump"
    printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
      --passphrase-fd 0 --decrypt --output "$DUMP" "$FILE"
    echo "decrypted ok"
    ;;
esac

# A custom-format dump starts with the magic bytes PGDMP.
[ "$(head -c 5 "$DUMP")" = "PGDMP" ] || { echo "not a pg_dump custom-format file" >&2; exit 1; }

psql_db postgres -qc "create database \"$DB\""
CREATED=1
echo "created scratch database $DB"

# The dump covers schemas public and auth only, not extensions. citext (friends
# migration) lives in public and must exist before the data restores; the others
# are what a Supabase project ships with.
psql_db "$DB" -q <<'SQL'
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
create extension if not exists citext schema public;
SQL

# --no-owner/--no-privileges: Supabase's owner roles and grants do not exist (or
# differ) locally. Errors are collected, not fatal: some objects (extension-owned
# functions, supabase-managed auth internals) can fail on a plain target.
set +e
if [ "$MODE" = host ]; then
  PGPASSWORD="$DBPASS" pg_restore -h "$HOST" -p "$PORT" -U "$DBUSER" -d "$DB" \
    --no-owner --no-privileges "$DUMP" 2>"$TMP/restore.err"
else
  docker exec -i "$CONTAINER" pg_restore -U "$DBUSER" -d "$DB" \
    --no-owner --no-privileges < "$DUMP" 2>"$TMP/restore.err"
fi
RC=$?
set -e
ERRS=$(grep -c '^pg_restore: error' "$TMP/restore.err" || true)
echo "pg_restore exit=$RC, errors=$ERRS"
if [ "$ERRS" -gt 0 ]; then
  echo "--- first errors ---"; grep '^pg_restore: error' "$TMP/restore.err" | head -10
fi

echo
echo "=== sanity counts (table | rows | latest created_at) ==="
FAIL=0
for t in auth.users public.profiles public.topics public.cards public.card_reviews \
         public.checkins public.missions public.xp_events public.coach_threads public.problems; do
  if ! out=$(psql_db "$DB" -Atq -F ' | ' -c \
    "select '$t', count(*), coalesce(max((to_jsonb(x)->>'created_at')::timestamptz)::text, '-') from $t x" 2>&1); then
    echo "$t | MISSING ($out)" | head -1
    FAIL=1
  else
    echo "$out"
  fi
done

if [ "$FAIL" = 1 ]; then echo "DRILL FAILED: key tables missing" >&2; exit 1; fi
echo "DRILL OK ($(date -u +%F))"
if [ "$KEEP" = 1 ]; then echo "kept scratch database $DB"; fi
