#!/usr/bin/env bash
# Raadi smoke test — runs against the full compose stack, through the gateway,
# exactly like a browser would (Host-based routing via --connect-to).
#   ./raadi smoke      or      docker compose --profile test run --rm smoke
set -uo pipefail

GW="${GATEWAY_INTERNAL:-traefik:80}"
PUBLIC="${PUBLIC_BASE_URL:?}"
AUTH="${AUTH_BASE_URL:?}"
GRAFANA="${GRAFANA_BASE_URL:?}"
REALM="${KEYCLOAK_REALM:-raadi}"
USER_EMAIL="kari.nordmann@${RAADI_DOMAIN:?}"
PASSWORD="${DEMO_USER_PASSWORD:?demo users are required for the smoke test}"
ORIGIN="$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$PUBLIC")"

JAR="$(mktemp)"; BODY="$(mktemp)"; HDRS="$(mktemp)"
trap 'rm -f "$JAR" "$BODY" "$HDRS"' EXIT
passed=0; failed=0

ok()   { passed=$((passed + 1)); printf '  \033[32m✔\033[0m %s\n' "$1"; }
fail() { failed=$((failed + 1)); printf '  \033[31m✘\033[0m %s\n' "$1"; [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# req <method> <url> [curl args...] — sets $status, body in $BODY, headers in $HDRS
req() {
  local method="$1" url="$2"; shift 2
  status=$(curl -s -o "$BODY" -D "$HDRS" -w '%{http_code}' --max-time 15 \
    --connect-to "::${GW}" -b "$JAR" -c "$JAR" -X "$method" "$@" "$url")
  # Browsers treat http://*.localhost as a secure context and accept "Secure"
  # cookies there (Keycloak's are always Secure); curl refuses them over plain
  # HTTP, so store them in the jar ourselves, like a browser would.
  if [[ "$url" =~ ^http://([^/:]+\.)?localhost[:/] ]]; then
    local host; host="$(sed -E 's#^http://([^/:]+).*#\1#' <<<"$url")"
    grep -i '^set-cookie:.*;\s*secure' "$HDRS" | tr -d '\r' | while IFS= read -r line; do
      local pair="${line#*: }"; pair="${pair%%;*}"
      local path; path="$(grep -oiE ';\s*path=[^;]*' <<<"$line" | head -1 | sed -E 's/;\s*[Pp]ath=//')"
      printf '%s\tFALSE\t%s\tFALSE\t0\t%s\t%s\n' "$host" "${path:-/}" "${pair%%=*}" "${pair#*=}" >> "$JAR"
    done
  fi
}
header() { grep -i "^$1:" "$HDRS" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
expect_status() { [[ "$status" == "$1" ]] && ok "$2" || fail "$2" "expected HTTP $1, got $status"; }
eventually() { # <description> <seconds> <command...>
  local desc="$1" secs="$2"; shift 2
  local end=$((SECONDS + secs))
  until "$@" >/dev/null 2>&1; do
    (( SECONDS >= end )) && { fail "$desc" "not true after ${secs}s"; return; }
    sleep 3
  done
  ok "$desc"
}

section "Gateway & web"
req GET "$PUBLIC/"
[[ "$status" =~ ^(200|307|308)$ ]] && ok "web answers on $PUBLIC/" || fail "web answers on $PUBLIC/" "HTTP $status"
req GET "$PUBLIC/en"
expect_status 200 "localized home page renders (/en)"
grep -q 'Raadi' "$BODY" && ok "home page contains the brand" || fail "home page contains the brand"
[[ "$(header x-content-type-options)" == "nosniff" ]] && ok "X-Content-Type-Options: nosniff" || fail "X-Content-Type-Options header"
[[ "$(header x-frame-options)" == "DENY" ]] && ok "X-Frame-Options: DENY" || fail "X-Frame-Options header"
[[ -n "$(header content-security-policy)" ]] && ok "Content-Security-Policy present" || fail "Content-Security-Policy header"
[[ -z "$(header x-powered-by)" ]] && ok "no X-Powered-By leak" || fail "X-Powered-By leaked"
req GET "$PUBLIC/api/health"
expect_status 200 "web health endpoint"
req GET "$PUBLIC/auth/forward"
expect_status 404 "token-handler endpoint is not publicly routable"

section "Identity provider"
req GET "$AUTH/realms/$REALM/.well-known/openid-configuration"
expect_status 200 "OIDC discovery"
issuer=$(jq -r .issuer "$BODY" 2>/dev/null)
[[ "$issuer" == "$AUTH/realms/$REALM" ]] && ok "issuer is $issuer" || fail "issuer" "got '$issuer'"
req GET "$AUTH/metrics"
[[ "$status" == "404" ]] && ok "Keycloak metrics not exposed publicly" || fail "Keycloak metrics exposed" "HTTP $status"

section "Login flow (Authorization Code + PKCE via identity-bff)"
req GET "$PUBLIC/api/v1/identity/me"
expect_status 401 "API rejects anonymous requests"
[[ "$(header content-type)" == application/problem+json* ]] && ok "errors are RFC 9457 problem+json" || fail "problem+json content type"

req GET "$PUBLIC/auth/login?returnTo=/en/account&locale=en"
loc="$(header location)"
[[ "$status" == "302" && "$loc" == "$AUTH/realms/$REALM/protocol/openid-connect/auth?"* ]] \
  && ok "login redirects to Keycloak" || fail "login redirects to Keycloak" "HTTP $status → $loc"
[[ "$loc" == *"code_challenge_method=S256"* ]] && ok "PKCE (S256) is used" || fail "PKCE missing"

req GET "$loc"
action=$(grep -o '<form[^>]*id="kc-form-login"[^>]*>' "$BODY" | grep -o 'action="[^"]*"' | head -1 | sed -e 's/^action="//' -e 's/"$//' -e 's/&amp;/\&/g')
[[ -n "$action" ]] && ok "Keycloak login form rendered" || fail "Keycloak login form rendered" "HTTP $status"

req POST "$action" --data-urlencode "username=$USER_EMAIL" --data-urlencode "password=$PASSWORD" --data-urlencode "credentialId="
cb="$(header location)"
[[ "$status" == "302" && "$cb" == "$PUBLIC/auth/callback?"* ]] && ok "credentials accepted, redirected to callback" \
  || fail "credentials accepted" "HTTP $status → $cb"

req GET "$cb"
[[ "$status" == "302" && "$(header location)" == "/en/account" ]] && ok "callback returns to /en/account" \
  || fail "callback redirect" "HTTP $status → $(header location)"
grep -qi '^set-cookie: raadi_sid=.*HttpOnly' "$HDRS" && ok "session cookie is HttpOnly" || fail "HttpOnly session cookie"
grep -qi '^set-cookie: raadi_sid=.*SameSite=Lax' "$HDRS" && ok "session cookie is SameSite=Lax" || fail "SameSite session cookie"

req GET "$PUBLIC/auth/session"
[[ "$(jq -r .user.email "$BODY" 2>/dev/null)" == "$USER_EMAIL" ]] && ok "session reports the signed-in user" || fail "session user" "$(cat "$BODY")"
grep -q 'eyJ' "$BODY" && fail "session endpoint leaks a token" || ok "no tokens exposed to the browser"

req GET "$PUBLIC/api/v1/identity/me"
expect_status 200 "API call authorised via session (token-handler)"
[[ "$(jq -r .email "$BODY" 2>/dev/null)" == "$USER_EMAIL" ]] && ok "/me returns the profile" || fail "/me profile" "$(cat "$BODY")"
jq -e '.roles | index("user")' "$BODY" >/dev/null 2>&1 && ok "/me includes realm roles" || fail "/me roles"

req PATCH "$PUBLIC/api/v1/identity/me" -H 'content-type: application/json' -H 'origin: https://evil.example' --data '{"locale":"en"}'
expect_status 403 "cross-site state change is rejected (CSRF)"
req PATCH "$PUBLIC/api/v1/identity/me" -H 'content-type: application/json' -H "origin: $ORIGIN" --data '{"locale":"so"}'
expect_status 200 "same-origin profile update succeeds"
req PATCH "$PUBLIC/api/v1/identity/me" -H 'content-type: application/json' -H "origin: $ORIGIN" --data '{"locale":"xx","isAdmin":true}'
expect_status 400 "invalid input is rejected by validation"
req PATCH "$PUBLIC/api/v1/identity/me" -H 'content-type: application/json' -H "origin: $ORIGIN" --data '{"locale":"nb"}'

req GET "$PUBLIC/en/account"
expect_status 200 "account page renders for the signed-in user"
grep -q "$USER_EMAIL" "$BODY" && ok "account page shows the user's e-mail" || fail "account page content"

req POST "$PUBLIC/auth/logout" -H "origin: $ORIGIN"
[[ "$status" == "303" && "$(header location)" == "$AUTH/realms/$REALM/protocol/openid-connect/logout?"* ]] \
  && ok "logout ends the Keycloak session (RP-initiated logout)" || fail "logout" "HTTP $status → $(header location)"
req GET "$PUBLIC/auth/session"
[[ "$(jq -r .authenticated "$BODY" 2>/dev/null)" == "false" ]] && ok "session is gone after logout" || fail "session after logout"

section "Operations"
req GET "$GRAFANA/api/health"
expect_status 200 "Grafana healthy via gateway"
q() { curl -sf --max-time 10 --get --data-urlencode "query=$1" http://prometheus:9090/api/v1/query | jq -e "$2"; }
eventually "all Prometheus scrape targets are up" 90 q 'count(up == 0) or vector(0)' '.data.result[0].value[1] == "0"'
eventually "identity-bff metrics arrive via OTLP" 90 q 'target_info{service_name="identity-bff"}' '.data.result | length > 0'
eventually "login counter recorded a success" 90 q 'raadi_auth_login_total{outcome="success"}' '.data.result | length > 0'
tempo() { curl -sf --max-time 10 --get --data-urlencode 'q={ resource.service.name = "identity-bff" }' \
  'http://tempo:3200/api/search' | jq -e '.traces | length > 0'; }
eventually "identity-bff traces are in Tempo" 90 tempo
loki() { curl -sf --max-time 10 --get --data-urlencode 'query={service_name="identity-bff"}' --data-urlencode 'limit=5' \
  http://loki:3100/loki/api/v1/query_range | jq -e '.data.result | length > 0'; }
eventually "identity-bff logs are in Loki" 90 loki

printf '\n\033[1m%d passed, %d failed\033[0m\n' "$passed" "$failed"
(( failed == 0 ))
