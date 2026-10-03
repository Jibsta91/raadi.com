#!/usr/bin/env bash
# Phone mode (ADR-0022): gets, or renews 30 days before expiry, a Let's Encrypt wildcard certificate for
# ${PHONE_DOMAIN} with a DNS-01 challenge (nothing has to be reachable from the internet), then installs
# it as Traefik's default certificate in place of the development CA's.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="phone-cert"
DOMAIN="${PHONE_DOMAIN:?PHONE_DOMAIN is required}"
[[ -s "${MASTER_DIR}/godaddy_pat" ]] || die "missing secret godaddy_pat: run ./raadi secret-set godaddy_pat"

EXEC_PATH=/opt/raadi/bin/godaddy-acme.sh EXEC_PROPAGATION_TIMEOUT=300 EXEC_POLLING_INTERVAL=10 \
  lego run --accept-tos --path /acme --dns exec --cert.name phone \
  -d "$DOMAIN" -d "*.${DOMAIN}" --renew-days 30 --log.format text \
  || die "could not get a certificate for ${DOMAIN}"

crt="$(find /acme -name phone.crt | head -1)"
key="$(find /acme -name phone.key | head -1)"
[[ -s "$crt" && -s "$key" ]] || die "lego finished but left no certificate in /acme"
install -m 0444 -o 65532 -g 0 "$crt" /certs/tls.crt
install -m 0400 -o 65532 -g 0 "$key" /certs/tls.key
info "Let's Encrypt certificate for ${DOMAIN} and *.${DOMAIN} installed for Traefik (expires $(openssl x509 -in /certs/tls.crt -noout -enddate | cut -d= -f2))"
