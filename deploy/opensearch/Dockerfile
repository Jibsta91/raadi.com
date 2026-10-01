# syntax=docker/dockerfile:1.12
# OpenSearch with only the security plugin: the bundled ML, alerting, SQL,
# k-NN and other plugins cost memory and start-up time that a single-purpose
# listings index does not need (ADR-0011 budget).
FROM opensearchproject/opensearch:3.9.0
# Plugins depend on each other, so remove in passes until only security is left.
RUN for pass in 1 2 3 4 5 6; do \
      for p in $(bin/opensearch-plugin list | grep -vx opensearch-security); do \
        bin/opensearch-plugin remove --purge "$p" >/dev/null 2>&1 || true; \
      done; \
    done \
 && test "$(bin/opensearch-plugin list)" = "opensearch-security" \
 && rm -rf config/opensearch-observability config/opensearch-reports-scheduler \
      config/opensearch-notifications config/opensearch-notifications-core config/opensearch-security-analytics
COPY --chown=1000:1000 opensearch.yml config/opensearch.yml
COPY --chown=1000:1000 security/ config/opensearch-security/
COPY --chmod=0755 entrypoint.sh /opt/raadi/entrypoint.sh
USER 1000
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
CMD ["opensearch"]
