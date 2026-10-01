# syntax=docker/dockerfile:1.12
# raadi-init: one image for every one-shot bootstrap task (secrets, OpenBao,
# databases + migrations, Keycloak realm, dev TLS, startup summary, smoke test).
# Scripts, migrations and the realm template are baked in so production servers
# need nothing but this image and the compose files.
FROM openbao/openbao:2.7.0 AS bao
FROM amacneil/dbmate:2.36.0 AS dbmate

FROM alpine:3.24.2 AS migrations
COPY services/ /src/services/
RUN mkdir -p /out && for d in /src/services/*/migrations; do \
      [ -d "$d" ] || continue; \
      svc="$(basename "$(dirname "$d")")"; cp -r "$d" "/out/$svc"; \
    done

FROM alpine:3.24.2
RUN apk add --no-cache bash curl jq openssl ca-certificates coreutils gettext postgresql17-client \
 && addgroup -S -g 65532 raadi && adduser -S -D -H -u 65532 -G raadi raadi
COPY --from=bao /usr/bin/bao /usr/local/bin/bao
COPY --from=dbmate /usr/local/bin/dbmate /usr/local/bin/dbmate
COPY --from=migrations /out/ /opt/raadi/migrations/
COPY deploy/init/manifest.json /opt/raadi/manifest.json
COPY deploy/keycloak/realm-raadi.json /opt/raadi/keycloak/realm-raadi.json
COPY deploy/init/scripts/ /opt/raadi/bin/
COPY tests/smoke/smoke.sh /opt/raadi/bin/smoke.sh
RUN chmod 0755 /opt/raadi/bin/*.sh
ENV PATH="/opt/raadi/bin:${PATH}" \
    SECRETS_DIR=/secrets
WORKDIR /opt/raadi
# Unprivileged by default. Compose grants root only to the bootstrap tasks that
# create and chown secret files for other containers (see deploy/compose/init.yaml).
USER 65532:65532
ENTRYPOINT ["/bin/bash"]
