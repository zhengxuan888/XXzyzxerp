#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:?release directory is required}"
base_url="${2:?application base URL is required}"

cd "$release_dir"
umask 077

postgres_password="$(openssl rand -hex 24)"
session_secret="$(openssl rand -hex 48)"
integration_credential_master_key="$(openssl rand -hex 48)"

printf '%s\n' \
  'NODE_ENV=production' \
  "APP_BASE_URL=$base_url" \
  'PORT=3000' \
  "POSTGRES_PASSWORD=$postgres_password" \
  "SESSION_SECRET=$session_secret" \
  "INTEGRATION_CREDENTIAL_MASTER_KEY=$integration_credential_master_key" \
  'SESSION_TTL_SECONDS=28800' \
  'STORAGE_PROVIDER=LOCAL_DEMO' \
  > .env.test-server

chmod 600 .env.test-server
mkdir -p data/storage
sudo chown -R 1001:1001 data/storage

docker compose --env-file .env.test-server -f compose.test.yaml config --quiet
