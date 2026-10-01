#!/bin/bash
set -euo pipefail
APICURIO_DATASOURCE_PASSWORD="$(cat "${SECRETS_PATH:-/run/secrets/raadi}/apicurio_db_password")"
export APICURIO_DATASOURCE_PASSWORD
exec /opt/jboss/container/java/run/run-java.sh "$@"
