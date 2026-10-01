#!/bin/bash
# The Keycloak image ships without curl; use bash's /dev/tcp against the
# management interface.
exec 3<>/dev/tcp/127.0.0.1/9000
printf 'GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
grep -q '"status": "UP"' <&3
