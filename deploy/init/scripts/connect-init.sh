#!/usr/bin/env bash
# Registers one Debezium outbox connector per service with "outbox": true
# (ADR-0008). PUT /connectors/<name>/config is an upsert, so this is idempotent
# and picks up config changes on the next `up`. Waits until every task runs.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="connect-init"

CONNECT="${CONNECT_URL:-http://kafka-connect:8083}"
retry 60 curl -fsS -o /dev/null "$CONNECT/connectors" || die "Kafka Connect is not reachable"

connector_config() { # <database>
  jq -n --arg db "$1" '{
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "tasks.max": "1",
    "plugin.name": "pgoutput",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${dir:/run/secrets/raadi:debezium_db_password}",
    "database.dbname": $db,
    "topic.prefix": ("raadi.cdc." + $db),
    "slot.name": ("dbz_" + $db),
    "publication.name": "dbz_outbox",
    "publication.autocreate.mode": "disabled",
    "table.include.list": "public.outbox",
    "snapshot.mode": "initial",
    "tombstones.on.delete": "false",
    "heartbeat.interval.ms": "60000",
    "heartbeat.action.query": "UPDATE public.cdc_heartbeat SET beat_at = now() WHERE id = 1",
    "topic.creation.default.replication.factor": "1",
    "topic.creation.default.partitions": "1",
    "key.converter": "org.apache.kafka.connect.storage.StringConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "aggregate_id",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.table.expand.json.payload": "true",
    "transforms.outbox.table.fields.additional.placement": "event_type:header:ce_type,traceparent:header:traceparent",
    "transforms.outbox.route.by.field": "aggregate_type",
    "transforms.outbox.route.topic.replacement": "raadi.${routedByValue}.events"
  }'
}

running() { # <name>
  curl -fsS "$CONNECT/connectors/$1/status" \
    | jq -e '.connector.state == "RUNNING" and (.tasks | length > 0) and all(.tasks[]; .state == "RUNNING")' >/dev/null
}

names=()
for svc in $(jq -r '.services | to_entries[] | select(.value.outbox) | .key' "$MANIFEST"); do
  db=$(jq -r --arg s "$svc" '.services[$s].database' "$MANIFEST")
  name="outbox-${db}"
  connector_config "$db" | curl -fsS -o /dev/null -X PUT -H 'Content-Type: application/json' \
    --data-binary @- "$CONNECT/connectors/${name}/config" || die "could not register ${name}"
  names+=("$name")
done

for name in "${names[@]}"; do
  # A failed task (e.g. the database was briefly unavailable) stays failed until
  # restarted; restarting only failed tasks is a no-op for healthy connectors.
  retry 10 curl -fs -o /dev/null -X POST \
    "$CONNECT/connectors/${name}/restart?includeTasks=true&onlyFailed=true" || true
  if ! retry 30 running "$name"; then
    curl -fsS "$CONNECT/connectors/$name/status" | jq -c . >&2 || true
    die "connector ${name} is not running"
  fi
  info "connector ${name} running"
done
