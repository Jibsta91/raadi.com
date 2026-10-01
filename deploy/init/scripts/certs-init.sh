#!/usr/bin/env bash
# Generates a local development CA and a wildcard certificate for
# ${RAADI_DOMAIN} and *.${RAADI_DOMAIN}. Trusting the CA on the host is
# optional (`./raadi ca-cert` exports it); plain HTTP works without it.
# Production uses Let's Encrypt via Traefik instead (compose.prod.yaml).
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="certs-init"

CERTS_DIR="${CERTS_DIR:-/certs}"
DOMAIN="${RAADI_DOMAIN:?RAADI_DOMAIN is required}"
TRAEFIK_UID="${TRAEFIK_UID:-65532}"
umask 077
mkdir -p "$CERTS_DIR"

if [[ ! -s "$CERTS_DIR/ca.key" ]]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$CERTS_DIR/ca.key"
  openssl req -x509 -new -key "$CERTS_DIR/ca.key" -sha256 -days 3650 \
    -subj "/O=Raadi Development/CN=Raadi Dev CA (local only, not for production)" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$CERTS_DIR/ca.crt"
  rm -f "$CERTS_DIR/tls.crt"
  info "generated development CA"
fi

needs_leaf=false
if [[ ! -s "$CERTS_DIR/tls.crt" ]]; then
  needs_leaf=true
elif ! openssl x509 -in "$CERTS_DIR/tls.crt" -noout -ext subjectAltName | grep -q "DNS:\*\.${DOMAIN}"; then
  needs_leaf=true; info "domain changed, re-issuing certificate"
elif ! openssl x509 -in "$CERTS_DIR/tls.crt" -noout -checkend $((30 * 86400)) >/dev/null; then
  needs_leaf=true; info "certificate expires within 30 days, re-issuing"
fi

if [[ "$needs_leaf" == true ]]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$CERTS_DIR/tls.key"
  openssl req -new -key "$CERTS_DIR/tls.key" -subj "/CN=${DOMAIN}" -out /tmp/tls.csr
  openssl x509 -req -in /tmp/tls.csr -CA "$CERTS_DIR/ca.crt" -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial -days 397 -sha256 -out /tmp/leaf.crt -extfile <(printf '%s\n' \
      "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN},DNS:localhost,IP:127.0.0.1" \
      "basicConstraints=critical,CA:FALSE" \
      "keyUsage=critical,digitalSignature" \
      "extendedKeyUsage=serverAuth")
  cat /tmp/leaf.crt "$CERTS_DIR/ca.crt" > "$CERTS_DIR/tls.crt"
  info "issued certificate for ${DOMAIN} and *.${DOMAIN}"
fi

# Traefik (non-root) may read the leaf key; the CA key stays root-only.
chown "$TRAEFIK_UID:0" "$CERTS_DIR/tls.key" "$CERTS_DIR/tls.crt"
chmod 0400 "$CERTS_DIR/tls.key" "$CERTS_DIR/ca.key"
chmod 0444 "$CERTS_DIR/tls.crt" "$CERTS_DIR/ca.crt"
chmod 0755 "$CERTS_DIR"
