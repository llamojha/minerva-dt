#!/bin/sh
# Runs at first DB boot (Postgres entrypoint executes *.sh in initdb.d). Unlike a bare
# .sql file, this can read env, so it threads ORDERS_ROWS through to init.sql as :rows.
set -e

ROWS="${ORDERS_ROWS:-3000000}"
echo "seeding orders with $ROWS rows..."

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v rows="$ROWS" \
  -f /init.sql
