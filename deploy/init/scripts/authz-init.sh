#!/usr/bin/env bash
# OpenFGA: creates the "raadi" store once and writes the authorization model
# when it differs from the latest one (models are immutable and versioned).
# Services resolve the store by name and always use the latest model.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="authz-init"

FGA="${OPENFGA_URL:-http://openfga:8080}"
MODEL=/opt/raadi/openfga/model.json
KEY="$(secret openfga_key_init)"
fga() { curl -fsS -H "Authorization: Bearer ${KEY}" -H 'Content-Type: application/json' "$@"; }

retry 30 fga -o /dev/null "$FGA/stores" || die "OpenFGA is not reachable"

store="$(fga "$FGA/stores?name=raadi" | jq -r '.stores[0].id // empty')"
if [[ -z "$store" ]]; then
  store="$(fga -X POST "$FGA/stores" -d '{"name":"raadi"}' | jq -r .id)"
  info "created store raadi (${store})"
fi

# Compare models structurally (OpenFGA echoes empty "object" fields back).
normalise() {
  jq -S '{schema_version, type_definitions: [(.type_definitions // [])[] | {type, relations: (.relations // {})}]}
    | walk(if type == "object" and .object == "" then del(.object) else . end)'
}
current="$(fga "$FGA/stores/${store}/authorization-models?page_size=1" | jq '.authorization_models[0] // {}' | normalise)"
wanted="$(normalise < "$MODEL")"
if [[ "$current" != "$wanted" ]]; then
  id="$(fga -X POST "$FGA/stores/${store}/authorization-models" --data-binary @"$MODEL" | jq -r .authorization_model_id)"
  info "wrote authorization model ${id}"
else
  info "authorization model is current"
fi

