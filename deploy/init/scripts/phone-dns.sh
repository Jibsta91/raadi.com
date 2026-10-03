#!/usr/bin/env bash
# Phone mode (docs/mobile.md, ADR-0022): points ${PHONE_DOMAIN} and *.${PHONE_DOMAIN} at this laptop's
# LAN address through the GoDaddy DNS API, so a phone on the same network reaches the stack by name.
# Only private addresses are published, and a record changes only when the address did.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="phone-dns"
# shellcheck source=godaddy.sh
source /opt/raadi/bin/godaddy.sh
IP="${LAN_IP:?LAN_IP is required}"
[[ "$IP" =~ ^(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\. ]] || die "LAN_IP ($IP) is not a private IPv4 address"

gd_init
sub="$(gd_relative "${PHONE_DOMAIN:?PHONE_DOMAIN is required}")"
gd_set "$sub" A "$IP"
gd_set "*.${sub}" A "$IP"
