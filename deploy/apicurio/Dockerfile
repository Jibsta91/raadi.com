# syntax=docker/dockerfile:1.12
# Apicurio Registry 3 (event schema registry) on PostgreSQL. The wrapper reads
# the database password from the secrets mount.
FROM apicurio/apicurio-registry:3.3.3
COPY --chmod=0755 entrypoint.sh /opt/raadi/entrypoint.sh
USER 1001
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
