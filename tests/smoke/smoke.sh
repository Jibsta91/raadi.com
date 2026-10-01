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
# login_as <email> — full Authorization Code + PKCE login through the gateway,
# starting from a fresh cookie jar. Returns non-zero on any failed step.
login_as() {
  : > "$JAR"
  req GET "$PUBLIC/auth/login?returnTo=/en&locale=en"
  local loc; loc="$(header location)"
  req GET "$loc"
  local action; action=$(grep -o '<form[^>]*id="kc-form-login"[^>]*>' "$BODY" | grep -o 'action="[^"]*"' | head -1 \
    | sed -e 's/^action="//' -e 's/"$//' -e 's/&amp;/\&/g')
  [[ -n "$action" ]] || return 1
  req POST "$action" --data-urlencode "username=$1" --data-urlencode "password=$PASSWORD" --data-urlencode "credentialId="
  local cb; cb="$(header location)"
  [[ "$cb" == "$PUBLIC/auth/callback?"* ]] || return 1
  req GET "$cb"
  [[ "$status" == "302" ]]
}
json() { jq -r "$1" "$BODY" 2>/dev/null; }
expect_status() { [[ "$status" == "$1" ]] && ok "$2" || fail "$2" "expected HTTP $1, got $status: $(head -c 400 "$BODY")"; }
q() { curl -sf --max-time 10 --get --data-urlencode "query=$1" http://prometheus:9090/api/v1/query | jq -e "$2"; }
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

section "Event backbone (Kafka, Debezium, Apicurio)"
connectors=$(curl -sf --max-time 10 http://kafka-connect:8083/connectors?expand=status \
  | jq '[.[] | select(.status.connector.state == "RUNNING" and all(.status.tasks[]; .state == "RUNNING"))] | length' 2>/dev/null)
[[ "$connectors" -ge 3 ]] && ok "Debezium outbox connectors running ($connectors)" || fail "Debezium connectors" "running: $connectors"
artifacts=$(curl -sf --max-time 10 'http://apicurio:8080/apis/registry/v3/groups/no.raadi.events/artifacts?limit=100' | jq '.count' 2>/dev/null)
[[ "$artifacts" -ge 8 ]] && ok "event schemas registered in Apicurio ($artifacts)" || fail "Apicurio artifacts" "count: $artifacts"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  http://apicurio:8080/apis/registry/v3/groups -d '{"groupId":"smoke"}')
[[ "$code" == "401" || "$code" == "403" ]] && ok "schema registry refuses anonymous writes" || fail "registry anonymous write" "HTTP $code"

section "Search (OpenSearch via Kafka)"
eventually "all demo listings are searchable" 180 \
  bash -c "curl -sf --connect-to ::$GW '$PUBLIC/api/v1/search/listings?pageSize=1' | jq -e '.total >= 500'"
req GET "$PUBLIC/api/v1/search/listings?category=bil&pageSize=5"
expect_status 200 "faceted search answers"
[[ "$(json '[.items[].category] | unique | join(",")')" == "bil" ]] && ok "category filter applies" || fail "category filter"
[[ "$(json '.facets.category | length')" -gt 1 ]] && ok "facets keep counts for other categories" || fail "facet counts"
req GET "$PUBLIC/api/v1/search/listings?near=bergen&radiusKm=100&sort=distance&pageSize=48"
json '.items | length > 0 and all(.[]; .distanceKm <= 100)' | grep -q true \
  && ok "geo radius search (100 km around Bergen) with distances" || fail "geo radius search" "$(head -c 300 "$BODY")"
req GET "$PUBLIC/api/v1/search/listings?q=langrennski"
[[ "$(json '.total')" -gt 0 ]] && ok "full-text search tolerates typos (langrennski)" || fail "fuzzy search"
req GET "$PUBLIC/api/v1/search/listings?category=boats"
expect_status 400 "invalid search parameters are rejected"
req GET "$PUBLIC/api/v1/search/suggest?q=Lan"
[[ "$(json '.suggestions | length')" -gt 0 ]] && ok "search-as-you-type suggestions" || fail "suggestions"

section "Listings, media and authorization"
# Images are optional, so take the newest listing that has one.
req GET "$PUBLIC/api/v1/search/listings?pageSize=24&sort=newest"
seeded="$(json '[.items[] | select(.image)][0].id')"; card="$(json '[.items[] | select(.image)][0].image.card')"
req GET "$PUBLIC/api/v1/listings/$seeded"
expect_status 200 "public listing detail"
[[ -n "$(header etag)" ]] && ok "listing has an ETag (optimistic concurrency)" || fail "ETag header"
req GET "$PUBLIC$card"
[[ "$status" == "200" && "$(header content-type)" == image/webp* ]] && ok "listing image served by imgproxy (WebP)" || fail "listing image" "HTTP $status"
req GET "$PUBLIC${card/pr:card/pr:large}"
expect_status 403 "imgproxy refuses tampered URLs (signature)"
req POST "$PUBLIC/api/v1/listings" -H 'content-type: application/json' -H "origin: $ORIGIN" --data '{}'
expect_status 401 "anonymous users cannot create listings"

login_as "$USER_EMAIL" && ok "logged in as $USER_EMAIL" || fail "login as $USER_EMAIL"
req POST "$PUBLIC/api/v1/media" -H "origin: $ORIGIN" -F "file=@/opt/raadi/fixtures/images/listing.jpg;type=image/jpeg"
expect_status 201 "image upload accepted (scanned, re-encoded)"
image="$(json '.id')"
[[ "$(json '.contentType')" == "image/jpeg" && "$(json '.width')" == "800" ]] && ok "stored image is a sanitized JPEG" || fail "stored image" "$(cat "$BODY")"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > /tmp/not-an-image.jpg
req POST "$PUBLIC/api/v1/media" -H "origin: $ORIGIN" -F "file=@/tmp/not-an-image.jpg;type=image/jpeg"
[[ "$status" == "422" && "$(json '.errors[0].code')" == "unsupported_type" ]] \
  && ok "non-images are refused by content sniffing" || fail "content sniffing" "HTTP $status $(cat "$BODY")"
# ClamAV's EICAR signature is anchored at offset 0, so the file is sent as is
# (every upload is scanned before its type is checked).
# shellcheck disable=SC2016 # the "$" characters are part of the EICAR string
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.jpg
req POST "$PUBLIC/api/v1/media" -H "origin: $ORIGIN" -F "file=@/tmp/eicar.jpg;type=image/jpeg"
[[ "$status" == "422" && "$(json '.errors[0].code')" == "malware" ]] && ok "ClamAV rejects the EICAR test virus" || fail "malware scan" "HTTP $status $(cat "$BODY")"

title="Smoke test $(date +%s%N | tail -c 7) Langrennsski"
listing_body() {
  jq -nc --arg t "$1" --arg img "$image" '{category: "torget", subcategory: "sport", title: $t,
    description: "Created by the smoke test.", priceNok: 1500, attributes: {condition: "good"},
    placeId: "tromso", imageIds: [$img]}'
}
req POST "$PUBLIC/api/v1/listings" -H 'content-type: application/json' -H 'origin: https://evil.example' --data "$(listing_body "$title")"
expect_status 403 "cross-site listing creation is rejected (CSRF)"
req POST "$PUBLIC/api/v1/listings" -H 'content-type: application/json' -H "origin: $ORIGIN" --data "$(listing_body "$title")"
expect_status 201 "listing created with an uploaded image"
listing="$(json '.id')"
[[ "$(json '.viewer.isOwner')" == "true" ]] && ok "creator is the owner (OpenFGA)" || fail "owner tuple"
req POST "$PUBLIC/api/v1/listings" -H 'content-type: application/json' -H "origin: $ORIGIN" \
  --data "$(listing_body "Selger våpen billig")"
[[ "$status" == "422" && "$(json '.errors[0].code')" == "prohibited_item" ]] && ok "OPA policy blocks prohibited items" || fail "OPA policy" "HTTP $status"
eventually "new listing reaches search via outbox -> Debezium -> Kafka" 90 \
  bash -c "curl -sf --connect-to ::$GW -G '$PUBLIC/api/v1/search/listings' --data-urlencode 'q=$title' | jq -e '.items[] | select(.id == \"$listing\")'"
req PATCH "$PUBLIC/api/v1/listings/$listing" -H 'content-type: application/json' -H "origin: $ORIGIN" -H 'if-match: "99"' --data '{"priceNok": 1200}'
expect_status 412 "stale If-Match is refused"
req PATCH "$PUBLIC/api/v1/listings/$listing" -H 'content-type: application/json' -H "origin: $ORIGIN" -H 'if-match: "1"' --data '{"priceNok": 1200}'
[[ "$status" == "200" && "$(json '.version')" == "2" ]] && ok "owner can edit (version 2)" || fail "owner edit" "HTTP $status"
req DELETE "$PUBLIC/api/v1/media/$image" -H "origin: $ORIGIN"
eventually "media learns the image is attached (listing events)" 60 \
  bash -c "curl -s -o /dev/null -w '%{http_code}' --connect-to ::$GW -b '$JAR' -X DELETE -H 'origin: $ORIGIN' '$PUBLIC/api/v1/media/$image' | grep -q 409"

login_as "ola.nordmann@${RAADI_DOMAIN}" || fail "login as ola"
req PATCH "$PUBLIC/api/v1/listings/$listing" -H 'content-type: application/json' -H "origin: $ORIGIN" --data '{"priceNok": 1}'
expect_status 403 "another user cannot edit the listing (OpenFGA)"
req POST "$PUBLIC/api/v1/listings" -H 'content-type: application/json' -H "origin: $ORIGIN" --data "$(listing_body "Stolen image")"
[[ "$status" == "422" ]] && ok "another user cannot attach someone else's image" || fail "image ownership" "HTTP $status"

login_as "moderator@${RAADI_DOMAIN}" || fail "login as moderator"
req DELETE "$PUBLIC/api/v1/listings/$listing" -H "origin: $ORIGIN"
expect_status 204 "a moderator can remove the listing (role as contextual tuple)"
eventually "removed listing disappears from search" 90 \
  bash -c "! curl -sf --connect-to ::$GW -G '$PUBLIC/api/v1/search/listings' --data-urlencode 'q=$title' | jq -e '.items[] | select(.id == \"$listing\")'"
req POST "$PUBLIC/auth/logout" -H "origin: $ORIGIN"

section "Messaging (conversations, WebSocket, events)"
: > "$JAR"
req GET "$PUBLIC/api/v1/messaging/conversations"
expect_status 401 "anonymous users cannot read conversations"
ws() { # <origin> — WebSocket handshake through the gateway with the session cookie
  curl -s -o /dev/null -w '%{http_code}' --max-time 3 --connect-to "::${GW}" -b "$JAR" \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H "Origin: $1" "$PUBLIC/api/v1/messaging/ws"
}
[[ "$(ws "$ORIGIN")" == "401" ]] && ok "anonymous WebSocket upgrades are refused" || fail "anonymous WebSocket"

login_as "$USER_EMAIL" || fail "login as $USER_EMAIL"
req GET "$PUBLIC/api/v1/listings/mine?limit=1"
kari_listing="$(json '.items[0].id')"
req GET "$PUBLIC/internal/v1/listings/$kari_listing/contact"
# The gateway sends the path to the web app (a locale redirect or 404), never to listings.
[[ "$status" =~ ^(307|404)$ ]] && ! grep -q ownerId "$BODY" \
  && ok "internal listings API is not reachable through the gateway" || fail "internal API exposed" "HTTP $status"

login_as "ola.nordmann@${RAADI_DOMAIN}" || fail "login as ola"
hello="Hei! Er denne fortsatt ledig? (smoke $(date +%s%N | tail -c 7))"
start() { jq -nc --arg l "$1" --arg b "$2" '{listingId: $l, body: $b}'; }
req POST "$PUBLIC/api/v1/messaging/conversations" -H 'content-type: application/json' \
  -H 'origin: https://evil.example' --data "$(start "$kari_listing" "$hello")"
expect_status 403 "cross-site message is rejected (CSRF)"
req POST "$PUBLIC/api/v1/messaging/conversations" -H 'content-type: application/json' \
  -H "origin: $ORIGIN" --data "$(start "$kari_listing" "$hello")"
[[ "$status" =~ ^20[01]$ && "$(json '.conversation.role')" == "buyer" && "$(json '.conversation.counterpart.name')" == "Kari N." ]] \
  && ok "buyer contacts the seller (HTTP $status)" || fail "start conversation" "HTTP $status $(head -c 300 "$BODY")"
conversation="$(json '.conversation.id')"
req POST "$PUBLIC/api/v1/messaging/conversations" -H 'content-type: application/json' \
  -H "origin: $ORIGIN" --data "$(start "$kari_listing" "En melding til")"
[[ "$status" == "200" && "$(json '.conversation.id')" == "$conversation" ]] \
  && ok "one conversation per listing and buyer" || fail "conversation reuse" "HTTP $status"
req GET "$PUBLIC/api/v1/listings/mine?limit=1"
req POST "$PUBLIC/api/v1/messaging/conversations" -H 'content-type: application/json' \
  -H "origin: $ORIGIN" --data "$(start "$(json '.items[0].id')" "Til meg selv")"
[[ "$status" == "422" && "$(json '.errors[0].code')" == "own_listing" ]] && ok "sellers cannot message themselves" || fail "own listing" "HTTP $status"
req POST "$PUBLIC/api/v1/messaging/conversations/$conversation/messages" -H 'content-type: application/json' \
  -H "origin: $ORIGIN" --data '{"body":"   "}'
expect_status 400 "empty messages are rejected"
[[ "$(ws "$ORIGIN")" == "101" ]] && ok "WebSocket opens for a signed-in user (via token handler)" || fail "WebSocket upgrade"
[[ "$(ws "https://evil.example")" == "403" ]] && ok "WebSocket refuses foreign origins" || fail "WebSocket origin check"

login_as "amina.hassan@${RAADI_DOMAIN}" || fail "login as amina"
req GET "$PUBLIC/api/v1/messaging/conversations/$conversation"
expect_status 404 "other users cannot read the conversation"

login_as "$USER_EMAIL" || fail "login as $USER_EMAIL"
req GET "$PUBLIC/api/v1/messaging/conversations/$conversation"
[[ "$status" == "200" && "$(json '.role')" == "seller" ]] && json '.messages[].body' | grep -qF "$hello" \
  && ok "the seller reads the conversation" || fail "seller view" "HTTP $status"
req GET "$PUBLIC/api/v1/messaging/unread"
[[ "$(json '.count')" -ge 2 ]] && ok "unread count for the seller ($(json '.count'))" || fail "unread count"
req POST "$PUBLIC/api/v1/messaging/conversations/$conversation/read" -H "origin: $ORIGIN"
expect_status 204 "seller marks the conversation read"
req GET "$PUBLIC/api/v1/messaging/conversations"
[[ "$(jq -r --arg c "$conversation" '.items[] | select(.id == $c) | .unread' "$BODY")" == "0" ]] \
  && ok "inbox shows the conversation as read" || fail "inbox unread after read"
eventually "message events reach Kafka (outbox -> Debezium)" 120 \
  q 'sum(kafka_partition_current_offset_ratio{topic="raadi.conversation.events"})' '.data.result[0].value[1] | tonumber > 0'
req POST "$PUBLIC/auth/logout" -H "origin: $ORIGIN"

section "Operations"
req GET "$GRAFANA/api/health"
expect_status 200 "Grafana healthy via gateway"
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
