# syntax=docker/dockerfile:1.12
# PostgreSQL 17 + PostGIS (location search) + pgvector (semantic search).
FROM postgres:17.11-trixie
ARG POSTGIS_VERSION=3.6
ARG PGVECTOR_VERSION=0.8.6
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      "postgresql-17-postgis-${POSTGIS_VERSION%%.*}=${POSTGIS_VERSION}.*" \
      "postgresql-17-postgis-${POSTGIS_VERSION%%.*}-scripts=${POSTGIS_VERSION}.*" \
      "postgresql-17-pgvector=${PGVECTOR_VERSION}*" \
 && rm -rf /var/lib/apt/lists/*
COPY postgresql.conf /etc/postgresql/postgresql.conf
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
USER postgres
