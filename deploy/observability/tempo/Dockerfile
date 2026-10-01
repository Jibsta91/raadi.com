# syntax=docker/dockerfile:1.12
# Upstream image is distroless (no shell); add a static busybox so compose
# healthchecks can probe the HTTP readiness endpoint. Nothing else changes.
FROM busybox:1.37.0-musl AS busybox
FROM grafana/tempo:2.10.8
COPY --from=busybox /bin/busybox /usr/local/bin/busybox
USER 10001:10001
