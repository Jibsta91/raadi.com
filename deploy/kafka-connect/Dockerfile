# syntax=docker/dockerfile:1.12
# Kafka Connect with the Debezium connectors. The wrapper reads the worker's
# SCRAM password from the secrets mount; connector configs reference secrets
# through DirectoryConfigProvider, so none are stored in the config topic.
FROM quay.io/debezium/connect:3.7.0.Final
COPY --chmod=0755 entrypoint.sh /opt/raadi/entrypoint.sh
USER kafka
ENTRYPOINT ["/opt/raadi/entrypoint.sh"]
CMD ["start"]
