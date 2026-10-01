#!/usr/bin/env bash
# Shared helpers for init scripts. Logs are single-line JSON so they land in
# Loki/`docker compose logs` in the same shape as service logs.
set -euo pipefail

# shellcheck disable=SC2034  # read by the scripts that source this file
MANIFEST=/opt/raadi/manifest.json
SECRETS_DIR="${SECRETS_DIR:-/secrets}"
MASTER_DIR="${SECRETS_DIR}/_master"

log() {
  local level="$1"; shift
  jq -cn --arg level "$level" --arg msg "$*" --arg task "${TASK:-init}" \
    '{time: (now | todate), level: $level, task: $task, msg: $msg}'
}
info() { log info "$@"; }
warn() { log warn "$@"; }
die() { log error "$@"; exit 1; }

# secret <name> — print a generated secret from the bootstrap store.
secret() {
  local f="${MASTER_DIR}/$1"
  [[ -s "$f" ]] || die "secret '$1' missing — did secrets-init run?"
  cat "$f"
}

# retry <attempts> <cmd...> — exponential backoff, capped at 10s.
retry() {
  local attempts="$1"; shift
  local n=1 delay=1
  until "$@"; do
    (( n >= attempts )) && return 1
    sleep "$delay"; n=$((n + 1)); delay=$(( delay * 2 > 10 ? 10 : delay * 2 ))
  done
}
