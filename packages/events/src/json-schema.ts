import { z } from 'zod';
import { contracts, type EventType } from './contracts.js';

/** JSON Schema (draft 2020-12) for an event's data, as registered in Apicurio. */
export function jsonSchemaFor(type: EventType): Record<string, unknown> {
  return {
    $id: `urn:raadi:event:${type}`,
    title: type,
    ...z.toJSONSchema(contracts[type], { target: 'draft-2020-12' }),
  };
}
