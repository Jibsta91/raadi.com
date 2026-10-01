# syntax=docker/dockerfile:1.12
# Open Policy Agent (static, distroless) plus busybox for the healthcheck probe.
FROM busybox:1.37.0-musl AS busybox
FROM openpolicyagent/opa:1.21.1-static
COPY --from=busybox /bin/busybox /usr/local/bin/busybox
COPY policies/ /policies/
USER 1000:1000
