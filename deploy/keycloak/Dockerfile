# syntax=docker/dockerfile:1.12
# Optimised Keycloak build: build-time options are baked in so `start --optimized`
# boots fast with a smaller footprint. Runtime config (hostname, DB URL, secrets)
# comes from the environment and the secrets volume — never from the image.
FROM quay.io/keycloak/keycloak:26.8.0 AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_TRACING_ENABLED=true \
    KC_CACHE=local \
    KC_FEATURES=passkeys
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.0
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --chmod=0755 entrypoint.sh /opt/raadi/entrypoint.sh
COPY --chmod=0755 healthcheck.sh /opt/raadi/healthcheck.sh
USER 1000
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
CMD ["start", "--optimized"]
