#!/usr/bin/env bash
# Keeps OpenBao initialised and unsealed. On first boot it initialises OpenBao
# (single key share — see ADR-0005 for the trade-off and the KMS upgrade path)
# and stores the unseal key and root token in the root-only secrets area.
# Afterwards it re-unseals OpenBao whenever it restarts.
# Uses the HTTP API (curl) rather than the bao CLI: this loop runs forever and
# must stay cheap.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="openbao-unsealer"

BAO_ADDR="${BAO_ADDR:-http://openbao:8200}"
D="${SECRETS_DIR}/_openbao"
mkdir -p "$D"; chmod 0700 "$D"
umask 077

api() { curl -fsS --max-time 10 -H 'Content-Type: application/json' "$@"; }

while true; do
  if ! st="$(api "$BAO_ADDR/v1/sys/seal-status" 2>/dev/null)"; then
    sleep 2; continue
  fi
  if [[ "$(jq -r .initialized <<<"$st")" != "true" ]]; then
    [[ -s "$D/unseal_key" ]] && die "OpenBao is uninitialised but an unseal key exists — refusing to re-initialise (restore the OpenBao volume or remove ${D})."
    out="$(api -X PUT "$BAO_ADDR/v1/sys/init" --data '{"secret_shares":1,"secret_threshold":1}')"
    jq -r '.keys_base64[0]' <<<"$out" > "$D/unseal_key.tmp" && mv "$D/unseal_key.tmp" "$D/unseal_key"
    jq -r '.root_token' <<<"$out" > "$D/root_token.tmp" && mv "$D/root_token.tmp" "$D/root_token"
    info "OpenBao initialised"
    continue
  fi
  if [[ "$(jq -r .sealed <<<"$st")" == "true" ]]; then
    jq -n --arg key "$(cat "$D/unseal_key")" '{key: $key}' \
      | api -X PUT "$BAO_ADDR/v1/sys/unseal" --data @- >/dev/null && info "OpenBao unsealed"
  fi
  sleep "${UNSEAL_INTERVAL:-5}"
done
