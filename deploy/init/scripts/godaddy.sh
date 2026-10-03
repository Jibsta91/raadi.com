#!/usr/bin/env bash
# GoDaddy DNS records API v3 with a Personal Access Token (scopes domains.domain:read and
# domains.dns:update), for phone mode and production (ADR-0022, ADR-0023). Source after lib.sh; needs DNS_ZONE.
# The PAT comes from the secrets volume (./raadi secret-set godaddy_pat), never from the environment.

GD_ZONE="${DNS_ZONE:?DNS_ZONE is required}"
GD_PAT_FILE="${MASTER_DIR}/godaddy_pat"
[[ -s "$GD_PAT_FILE" ]] || die "missing secret godaddy_pat: run ./raadi secret-set godaddy_pat"

# gd_init: finds the records collection (GoDaddy documents it under two paths). Call once, before
# any other gd_ function, in the main shell (not in $(...)), so GD_BASE is kept.
gd_init() {
  local base code
  for base in "https://api.godaddy.com/v3/domains/zones/${GD_ZONE}" "https://api.godaddy.com/v3/zones/${GD_ZONE}"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -H @<(gd_auth) "${base}/dns-records?pageSize=1")"
    case "$code" in
      200) GD_BASE="$base"; return ;;
      401 | 403) die "GoDaddy refused the token (HTTP $code): check it and its scopes (domains.domain:read, domains.dns:update)" ;;
    esac
  done
  die "GoDaddy DNS API for ${GD_ZONE} not reachable (last HTTP ${code:-none})"
}

gd_auth() { printf 'Authorization: Bearer %s\n' "$(cat "$GD_PAT_FILE")"; }

# gd_api <method> <path-after-base> [json-body]
gd_api() {
  local method="$1" path="$2" body="${3:-}"
  [[ -n "${GD_BASE:-}" ]] || die "gd_init must run first"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" -H @<(gd_auth) -H 'Content-Type: application/json' --data-binary "$body" "${GD_BASE}${path}"
  else
    curl -fsS -X "$method" -H @<(gd_auth) "${GD_BASE}${path}"
  fi
}

# gd_records <name> <type>: matching records as a JSON array (name relative to the zone).
gd_records() {
  local query
  query="$(jq -rn --arg n "$1" --arg t "$2" '"name=\($n|@uri)&type=\($t)&pageSize=100"')"
  gd_api GET "/dns-records?${query}" | jq --arg n "$1" --arg t "$2" '[.items[]? | select(.name == $n and .type == $t)]'
}

# gd_set <name> <type> <data>: make exactly one record hold <data> (create, update or no-op).
gd_set() {
  local name="$1" type="$2" data="$3" existing id current body
  existing="$(gd_records "$name" "$type")"
  id="$(jq -r '.[0].recordId // empty' <<<"$existing")"
  current="$(jq -r '.[0].data // empty' <<<"$existing")"
  body="$(jq -nc --arg n "$name" --arg t "$type" --arg d "$data" '{name: $n, type: $t, data: $d, ttl: 600}')"
  if [[ -z "$id" ]]; then
    gd_api POST /dns-records "$body" >/dev/null && info "${name}.${GD_ZONE} ${type} created: ${data}"
  elif [[ "$current" != "$data" ]]; then
    gd_api PUT "/dns-records/${id}" "$body" >/dev/null && info "${name}.${GD_ZONE} ${type} updated: ${current} -> ${data}"
  else
    info "${name}.${GD_ZONE} ${type} already ${data}"
  fi
}

# gd_add <name> <type> <data>: add a record next to existing ones (ACME needs two TXT values at once).
gd_add() {
  gd_api POST /dns-records "$(jq -nc --arg n "$1" --arg t "$2" --arg d "$3" '{name: $n, type: $t, data: $d, ttl: 600}')" >/dev/null
}

# gd_remove <name> <type> <data>: delete the records of that name and type holding exactly <data>.
gd_remove() {
  local id
  for id in $(gd_records "$1" "$2" | jq -r --arg d "$3" '.[] | select(.data == $d) | .recordId'); do
    gd_api DELETE "/dns-records/${id}" >/dev/null
  done
}

# gd_relative <fqdn>: name relative to the zone (trailing dot allowed), or fail outside the zone.
gd_relative() {
  local fqdn="${1%.}"
  [[ "$fqdn" == *".${GD_ZONE}" ]] || die "${fqdn} is not in zone ${GD_ZONE}"
  printf '%s' "${fqdn%."${GD_ZONE}"}"
}
