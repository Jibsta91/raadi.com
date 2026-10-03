#!/usr/bin/env bash
# Points ${DNS_NAME} and *.${DNS_NAME} at ${TARGET_IP} through the GoDaddy DNS API (ADR-0022, ADR-0023).
#   phone mode:  DNS_NAME=dev.raadiso.com, a private LAN address (ADDRESS_KIND=private)
#   production:  DNS_NAME=raadiso.com, the server's public address (ADDRESS_KIND=public, ./raadi dns)
# A record changes only when its address differs. DRY_RUN=1 reports what would change.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="dns"
# shellcheck source=godaddy.sh
source /opt/raadi/bin/godaddy.sh
NAME="${DNS_NAME:?DNS_NAME is required}"
IP="${TARGET_IP:?TARGET_IP is required}"
KIND="${ADDRESS_KIND:?ADDRESS_KIND is required (private or public)}"

[[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "TARGET_IP ($IP) is not an IPv4 address"
private='^(10|127|192\.168|172\.(1[6-9]|2[0-9]|3[01])|169\.254|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7]))\.'
case "$KIND" in
  private) [[ "$IP" =~ ^(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\. ]] || die "$IP is not a private LAN address" ;;
  public) [[ ! "$IP" =~ $private && ! "$IP" =~ ^(0|22[4-9]|2[3-5][0-9])\. ]] || die "$IP is not a public address" ;;
  *) die "ADDRESS_KIND must be private or public" ;;
esac

gd_init
if [[ "${NAME%.}" == "$GD_ZONE" ]]; then
  names=("@" "*")
else
  sub="$(gd_relative "$NAME")"
  names=("$sub" "*.${sub}")
fi
for name in "${names[@]}"; do
  if [[ "${DRY_RUN:-0}" == 1 ]]; then
    current="$(gd_records "$name" A | jq -r '[.[].data] | join(", ")')"
    info "dry run: ${name} (${GD_ZONE}) A is [${current:-none}], would be ${IP}"
  else
    gd_set "$name" A "$IP"
  fi
done
