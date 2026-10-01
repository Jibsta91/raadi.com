#!/bin/bash
# Hands the worker its SCRAM credentials (from the secrets mount, never from
# compose) and starts Debezium's stock entrypoint.
set -euo pipefail
S="${SECRETS_PATH:-/run/secrets/raadi}"
jaas="org.apache.kafka.common.security.scram.ScramLoginModule required username=\"connect\" password=\"$(cat "$S/kafka_connect_password")\";"
# All three are in the stock entrypoint's SENSITIVE_PROPERTIES list (never logged).
export CONNECT_SASL_JAAS_CONFIG="$jaas" CONNECT_PRODUCER_SASL_JAAS_CONFIG="$jaas" \
  CONNECT_CONSUMER_SASL_JAAS_CONFIG="$jaas"
unset jaas
exec /docker-entrypoint.sh "$@"
