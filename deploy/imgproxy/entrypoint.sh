#!/bin/bash
# Secrets come from the read-only secrets mount, never from compose.
set -euo pipefail
S="${SECRETS_PATH:-/run/secrets/raadi}"
IMGPROXY_KEY="$(cat "$S/imgproxy_key")"
IMGPROXY_SALT="$(cat "$S/imgproxy_salt")"
AWS_SECRET_ACCESS_KEY="$(cat "$S/seaweedfs_imgproxy_secret")"
export IMGPROXY_KEY IMGPROXY_SALT AWS_SECRET_ACCESS_KEY
exec /usr/local/bin/entrypoint.sh "$@"
