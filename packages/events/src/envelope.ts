import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { contracts, type EventData, type EventType } from './contracts.js';

/** Apicurio group that holds every event schema (artifact id = event type). */
export const SCHEMA_GROUP = 'no.raadi.events';
const REGISTRY = 'http://apicurio:8080/apis/registry/v3';

/** URL of the schema an event conforms to (CloudEvents `dataschema`). */
export function schemaUrl(type: EventType): string {
  return `${REGISTRY}/groups/${SCHEMA_GROUP}/artifacts/${type}`;
}

/** CloudEvents 1.0, structured JSON mode. */
export const envelopeSchema = z.object({
  specversion: z.literal('1.0'),
  id: z.uuid(),
  source: z.string().min(1),
  type: z.string().min(1),
  subject: z.string().optional(),
  time: z.iso.datetime({ offset: true }),
  datacontenttype: z.literal('application/json').optional(),
  dataschema: z.url().optional(),
  data: z.unknown(),
});

export interface CloudEvent<T extends EventType = EventType> {
  specversion: '1.0';
  id: string;
  source: string;
  type: T;
  subject?: string;
  time: string;
  datacontenttype?: 'application/json';
  dataschema?: string;
  data: EventData<T>;
}

/** Builds an event and validates its data against the contract (throws on mismatch). */
export function buildEvent<T extends EventType>(
  type: T,
  init: { source: string; subject: string; data: EventData<T>; id?: string; time?: Date },
): CloudEvent<T> {
  const data = contracts[type].parse(init.data) as EventData<T>;
  return {
    specversion: '1.0',
    id: init.id ?? randomUUID(),
    source: init.source,
    type,
    subject: init.subject,
    time: (init.time ?? new Date()).toISOString(),
    datacontenttype: 'application/json',
    dataschema: schemaUrl(type),
    data,
  };
}

export class InvalidEventError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = 'InvalidEventError';
  }
}

export type ParsedEvent = { [T in EventType]: CloudEvent<T> }[EventType];

/**
 * Parses a received event. Returns null for types this build does not know
 * (forward compatibility); throws InvalidEventError for a known type whose
 * envelope or data does not match the contract.
 */
export function parseEvent(raw: unknown): ParsedEvent | null {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success)
    throw new InvalidEventError('invalid CloudEvents envelope', envelope.error.issues);
  const type = envelope.data.type;
  if (!(type in contracts)) return null;
  const data = contracts[type as EventType].safeParse(envelope.data.data);
  if (!data.success) throw new InvalidEventError(`invalid data for ${type}`, data.error.issues);
  return { ...envelope.data, data: data.data } as ParsedEvent;
}
