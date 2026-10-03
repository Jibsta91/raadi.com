#!/usr/bin/env bash
# Phone mode (docs/mobile.md): points ${PHONE_DOMAIN} and *.${PHONE_DOMAIN} at this laptop's LAN
# address through the GoDaddy DNS API, so a phone on the same network reaches the stack by name.
# Only private addresses are published, and a record is changed only when it differs.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="phone-dns"
DOMAIN="${PHONE_DOMAIN:?PHONE_DOMAIN is required}"
ZONE="${PHONE_DNS_ZONE:?PHONE_DNS_ZONE is required}"
IP="${LAN_IP:?LAN_IP is required}"

[[ "$DOMAIN" == *".${ZONE}" ]] || die "PHONE_DOMAIN ($DOMAIN) must be a subdomain of PHONE_DNS_ZONE ($ZONE)"
[[ "$IP" =~ ^(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\. ]] || die "LAN_IP ($IP) is not a private IPv4 address"
for name in godaddy_api_key godaddy_api_secret; do
  [[ -s "${MASTER_DIR}/${name}" ]] || die "missing secret ${name}: run ./raadi secret-set ${name}"
done
auth="Authorization: sso-key $(cat "${MASTER_DIR}/godaddy_api_key"):$(cat "${MASTER_DIR}/godaddy_api_secret")"
api="https://api.godaddy.com/v1/domains/${ZONE}/records/A"
sub="${DOMAIN%."${ZONE}"}"

for name in "$sub" "*.${sub}"; do
  path="$(jq -rn --arg n "$name" '$n | @uri')"
  current="$(curl -fsS -H "$auth" "${api}/${path}" | jq -r '.[0].data // empty')" \
    || die "GoDaddy API refused the request (check the key, and that it is a production key)"
  if [[ "$current" == "$IP" ]]; then
    info "${name}.${ZONE} already points at ${IP}"
  else
    jq -n --arg ip "$IP" '[{data: $ip, ttl: 600}]' \
      | curl -fsS -X PUT -H "$auth" -H 'Content-Type: application/json' --data-binary @- "${api}/${path}" \
      || die "could not update ${name}.${ZONE}"
    info "${name}.${ZONE} now points at ${IP} (was ${current:-unset})"
  fi
done
