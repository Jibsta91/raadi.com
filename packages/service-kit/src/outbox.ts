import { context, propagation } from '@opentelemetry/api';

/** Anything that can run a parameterised query (pg Pool or PoolClient). */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export interface OutboxEvent {
  id: string;
  type: string;
}

/**
 * Appends a CloudEvent to the service's outbox table (ADR-0008). Call it with
 * the transaction's client so the event commits atomically with the state
 * change. Debezium routes the row to raadi.<aggregateType>.events, keyed by
 * aggregateId; the current W3C trace context travels along as a header.
 */
export async function appendToOutbox(
  db: Queryable,
  aggregateType: string,
  aggregateId: string,
  event: OutboxEvent,
): Promise<void> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  await db.query(
    `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, traceparent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.id, aggregateType, aggregateId, event.type, event, carrier.traceparent ?? null],
  );
}
