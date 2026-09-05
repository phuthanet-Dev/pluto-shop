#!/usr/bin/env bash
# Read references from the actual dump, never from the changing live database.
set -Eeuo pipefail
dump_dir="$(realpath "$1")"
check_container="pluto-dump-manifest-$(openssl rand -hex 8)"
trap 'docker rm -f "$check_container" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$check_container" --network none --cpus 1 --memory 1g \
  --mount "type=bind,src=$dump_dir,dst=/backup,readonly" \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 32)" postgres:18.6 >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$check_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$check_container" psql -U postgres -v ON_ERROR_STOP=1 -c \
  'CREATE ROLE pluto_app; CREATE ROLE pluto_user; CREATE ROLE pluto_admin; CREATE ROLE pluto_inspector;' >/dev/null
docker exec "$check_container" pg_restore -U postgres --exit-on-error --no-owner --no-acl -d postgres /backup/plutoshop.dump
docker exec -i "$check_container" psql -X -U postgres -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.products') IS NOT NULL AS has_products \gset
\if :has_products
SELECT image_key FROM products WHERE image_key IS NOT NULL ORDER BY image_key;
\endif
SQL
