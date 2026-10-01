#!/bin/bash
# Installs the node certificates and the internal users (bcrypt hashes rendered
# by secrets-init) into the config directory, then starts the stock entrypoint.
set -euo pipefail
CFG=/usr/share/opensearch/config
mkdir -p "$CFG/certs"
# The sources are read-only (0400) and the copies keep that mode. Without
# CAP_DAC_OVERRIDE a restart cannot overwrite them, so replace them instead.
rm -f "$CFG"/certs/*.pem "$CFG/opensearch-security/internal_users.yml"
cp /run/certs/opensearch/node.pem /run/certs/opensearch/node-key.pem /run/certs/opensearch/ca.pem "$CFG/certs/"
chmod 0600 "$CFG/certs/node-key.pem"
cp /run/secrets/raadi/internal_users.yml "$CFG/opensearch-security/internal_users.yml"
# Credentials for the container healthcheck only (the read-only monitor user).
printf 'machine 127.0.0.1 login monitor password %s\n' "$(cat /run/secrets/raadi/opensearch_monitor_password)" > /tmp/.netrc
chmod 0600 /tmp/.netrc
# The stock entrypoint would install demo certificates and users without this.
export DISABLE_INSTALL_DEMO_CONFIG=true
exec ./opensearch-docker-entrypoint.sh "$@"
