# syntax=docker/dockerfile:1.12
# Kafka 4 in KRaft mode (no ZooKeeper). Our entrypoint renders server.properties
# from the secrets mount and formats storage with the SCRAM admin on first boot;
# the same image runs kafka-init (users, topics, ACLs).
FROM apache/kafka:4.3.1
COPY --chmod=0755 entrypoint.sh init.sh /opt/raadi/
COPY server.properties /opt/raadi/server.properties
# kafka-init records the applied topology here (a named volume inherits this owner).
USER root
RUN mkdir -p /state && chown appuser:appuser /state
USER appuser
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
