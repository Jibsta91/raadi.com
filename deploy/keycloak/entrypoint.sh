#!/bin/bash
# Reads secrets from the read-only secrets mount (never from env files or the
# image) and hands over to Keycloak.
set -euo pipefail
S="${SECRETS_PATH:-/run/secrets/raadi}"
KC_DB_PASSWORD="$(cat "$S/keycloak_db_password")"
KC_BOOTSTRAP_ADMIN_PASSWORD="$(cat "$S/keycloak_admin_password")"
export KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD
exec /opt/keycloak/bin/kc.sh "$@"
