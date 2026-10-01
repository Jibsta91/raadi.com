#!/usr/bin/env bash
# Registers the event JSON Schemas (packages/events/schemas, generated from the
# zod contracts) in Apicurio Registry. Global rules make every new version
# prove BACKWARD compatibility, so a breaking change fails here, at deploy time.
# Idempotent: a version is added only when the content changed.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="registry-init"

REG="${REGISTRY_URL:-http://apicurio:8080}/apis/registry/v3"
KC="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}/realms/${KEYCLOAK_REALM:-raadi}"
GROUP=no.raadi.events

token() {
  curl -fsS "$KC/protocol/openid-connect/token" --data-urlencode grant_type=client_credentials \
    --data-urlencode client_id=registry-init --data-urlencode "client_secret=$(secret registry_init_client_secret)" \
    | jq -r .access_token
}
retry 30 curl -fsS -o /dev/null "$REG/system/info" || die "Apicurio Registry is not reachable"
TOKEN="$(retry 10 token)" || die "cannot obtain a registry token"
api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }

for rule in "COMPATIBILITY BACKWARD" "VALIDITY FULL"; do
  read -r type config <<<"$rule"
  if curl -fs -o /dev/null "$REG/admin/rules/$type" -H "Authorization: Bearer $TOKEN"; then
    api -X PUT "$REG/admin/rules/$type" -d "{\"config\":\"$config\"}" >/dev/null
  else
    api -X POST "$REG/admin/rules" -d "{\"ruleType\":\"$type\",\"config\":\"$config\"}" >/dev/null
  fi
done

created=0 updated=0
for file in /opt/raadi/events/schemas/*.json; do
  id="$(basename "$file" .json)"
  body="$(jq -c . "$file")"
  latest="$(curl -fs "$REG/groups/$GROUP/artifacts/$id/versions/branch=latest/content" || true)"
  if [[ -z "$latest" ]]; then
    jq -n --arg id "$id" --arg content "$body" '{artifactId: $id, artifactType: "JSON",
        firstVersion: {content: {content: $content, contentType: "application/json"}}}' \
      | api -X POST "$REG/groups/$GROUP/artifacts" --data-binary @- >/dev/null \
      || die "could not register ${id}"
    created=$((created + 1))
  elif [[ "$(jq -cS . <<<"$latest")" != "$(jq -cS . <<<"$body")" ]]; then
    jq -n --arg content "$body" '{content: {content: $content, contentType: "application/json"}}' \
      | api -X POST "$REG/groups/$GROUP/artifacts/$id/versions" --data-binary @- >/dev/null \
      || die "${id}: new version rejected (not BACKWARD compatible?)"
    updated=$((updated + 1))
  fi
done
info "event schemas registered (${created} new, ${updated} new version(s))"
