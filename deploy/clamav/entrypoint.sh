#!/bin/sh
# clamd in the foreground; freshclam as a background daemon unless disabled
# (CLAMAV_FRESHCLAM=false, e.g. air-gapped installs).
set -eu
if [ "${CLAMAV_FRESHCLAM:-true}" = "true" ]; then
  freshclam --config-file=/etc/raadi/freshclam.conf --daemon --stdout --checks="${FRESHCLAM_CHECKS:-2}" &
fi
exec clamd --config-file=/etc/raadi/clamd.conf
