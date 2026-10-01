#!/usr/bin/env bash
# Imports/updates the "raadi" realm through the Keycloak Admin API.
# First run: creates the realm from the template. Later runs: keeps realm
# settings and clients (redirect URIs, secrets) in sync with config, and adds
# missing roles/users without touching existing ones.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="keycloak-init"

KC="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-raadi}"

BFF_CLIENT_SECRET="$(secret bff_oidc_client_secret)"
GRAFANA_CLIENT_SECRET="$(secret grafana_oidc_client_secret)"
export PUBLIC_BASE_URL AUTH_BASE_URL GRAFANA_BASE_URL RAADI_DOMAIN REALM BFF_CLIENT_SECRET GRAFANA_CLIENT_SECRET \
  SMTP_HOST="${SMTP_HOST:-mailpit}" SMTP_PORT="${SMTP_PORT:-1025}" \
  SMTP_FROM="${SMTP_FROM:-no-reply@${RAADI_DOMAIN}}" \
  DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-}"

# envsubst only replaces this explicit list (Keycloak's own ${...} keys stay intact).
# shellcheck disable=SC2016
vars='$PUBLIC_BASE_URL $AUTH_BASE_URL $GRAFANA_BASE_URL $RAADI_DOMAIN $REALM $SMTP_HOST $SMTP_PORT $SMTP_FROM $DEMO_USER_PASSWORD $BFF_CLIENT_SECRET $GRAFANA_CLIENT_SECRET'
realm="$(envsubst "$vars" < /opt/raadi/keycloak/realm-raadi.json)"
if [[ "${SEED_DEMO_DATA:-false}" != "true" ]]; then
  realm="$(jq 'del(.users)' <<<"$realm")"
fi

token() {
  curl -fsS "$KC/realms/master/protocol/openid-connect/token" \
    --data-urlencode client_id=admin-cli --data-urlencode grant_type=password \
    --data-urlencode username="${KEYCLOAK_ADMIN_USER:-admin}" \
    --data-urlencode "password=$(secret keycloak_admin_password)" | jq -r .access_token
}
retry 30 token >/dev/null || die "cannot obtain Keycloak admin token"
TOKEN="$(token)"
api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }

code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$KC/admin/realms/$REALM")
if [[ "$code" == "404" ]]; then
  api -X POST "$KC/admin/realms" --data-binary @- <<<"$realm"
  info "realm ${REALM} created"
else
  settings="$(jq 'del(.users, .clients, .roles, .groups, .clientScopes, .components, .authenticationFlows,
    .authenticatorConfig, .requiredActions, .identityProviders, .identityProviderMappers,
    .defaultDefaultClientScopes, .defaultOptionalClientScopes, .defaultRole)' <<<"$realm")"
  api -X PUT "$KC/admin/realms/$REALM" --data-binary @- <<<"$settings"
  jq '{ifResourceExists: "OVERWRITE", clients: .clients}' <<<"$realm" \
    | api -X POST "$KC/admin/realms/$REALM/partialImport" --data-binary @- >/dev/null
  jq '{ifResourceExists: "SKIP", roles: .roles, groups: (.groups // []), users: (.users // [])}' <<<"$realm" \
    | api -X POST "$KC/admin/realms/$REALM/partialImport" --data-binary @- >/dev/null
  info "realm ${REALM} updated"
fi

# Self-registered users get the "user" role through the realm's default role.
user_role="$(api "$KC/admin/realms/$REALM/roles/user")"
api -X POST "$KC/admin/realms/$REALM/roles/default-roles-${REALM}/composites" \
  --data-binary "[$user_role]" >/dev/null
info "default role includes 'user'"
