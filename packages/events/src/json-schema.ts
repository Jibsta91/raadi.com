import { z } from 'zod';
import { contracts, type EventType } from './contracts.js';

/**
 * JSON Schema (draft-07) for an event's data, as registered in Apicurio.
 * Draft-07 because Apicurio's compatibility checker (everit) cannot read
 * 2020-12 schemas: with them every new version is refused (ADR-0012).
 */
export function jsonSchemaFor(type: EventType): Record<string, unknown> {
  return {
    $id: `urn:raadi:event:${type}`,
    title: type,
    ...z.toJSONSchema(contracts[type], { target: 'draft-7' }),
  };
}
