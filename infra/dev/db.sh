#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ "$POSTGRES_DB" == plutoshop_dev ]] || {
  printf '%s\n' 'Hermes database access is restricted to plutoshop_dev.' >&2
  exit 1
}
: "${POSTGRES_HERMES_PASSWORD:?Run the Dev credential setup first}"

for option in "$@"; do
  case "$option" in
    -h|-h*|-p|-p*|-U|-U*|-d|-d*|-W|--host|--host=*|--port|--port=*|--username|--username=*|--dbname|--dbname=*|--password)
      printf '%s\n' 'The database host, user, and database are fixed; pass SQL through stdin.' >&2
      exit 2
      ;;
  esac
done

export PGPASSWORD="$POSTGRES_HERMES_PASSWORD"
exec "${COMPOSE[@]}" exec --interactive --no-TTY --env PGPASSWORD postgres \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --host 127.0.0.1 --username hermes_dev_operator --dbname plutoshop_dev "$@"
