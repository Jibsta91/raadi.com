#!/usr/bin/env bash
# Renders the broker configuration with the admin credential from the secrets
# mount (never from the environment) and formats KRaft storage on first boot,
# creating the SCRAM admin user at the same time.
set -euo pipefail
S="${SECRETS_PATH:-/run/secrets/raadi}"
CONF=/tmp/server.properties
DATA=/var/lib/kafka/data
admin_pw="$(cat "$S/kafka_admin_password")"

umask 077
cp /opt/raadi/server.properties "$CONF"
printf '%s\n' \
  "listener.name.internal.scram-sha-512.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"admin\" password=\"${admin_pw}\";" \
  >> "$CONF"

if [[ ! -f "$DATA/meta.properties" ]]; then
  cluster_id="$(/opt/kafka/bin/kafka-storage.sh random-uuid)"
  /opt/kafka/bin/kafka-storage.sh format --ignore-formatted -t "$cluster_id" -c "$CONF" \
    --add-scram "SCRAM-SHA-512=[name=admin,password=${admin_pw}]"
fi
unset admin_pw
exec /opt/kafka/bin/kafka-server-start.sh "$CONF"
