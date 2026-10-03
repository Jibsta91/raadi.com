#!/usr/bin/env bash
# lego's "exec" DNS provider hook (phone-cert.sh): `present|cleanup <fqdn.> <value>` adds or removes the
# _acme-challenge TXT record through the GoDaddy DNS API. A wildcard and its apex need two TXT values
# for the same name at once, so records are added, never replaced.
# shellcheck source=lib.sh
source /opt/raadi/bin/lib.sh
TASK="phone-cert"
# shellcheck source=godaddy.sh
source /opt/raadi/bin/godaddy.sh
action="${1:?present|cleanup}" fqdn="${2:?fqdn}" value="${3:?value}"
gd_init
name="$(gd_relative "$fqdn")"
case "$action" in
  present) gd_add "$name" TXT "$value" && info "challenge record ${name} added" ;;
  cleanup) gd_remove "$name" TXT "$value" && info "challenge record ${name} removed" ;;
  *) die "unknown action ${action}" ;;
esac
