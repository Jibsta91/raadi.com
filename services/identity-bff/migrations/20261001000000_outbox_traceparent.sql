-- migrate:up
-- W3C trace context of the request that wrote the event. Debezium copies it into
-- a Kafka header, so consumers continue the same trace.
ALTER TABLE outbox ADD COLUMN traceparent text;

-- migrate:down
ALTER TABLE outbox DROP COLUMN traceparent;
