// Writes schemas/<type>.json from the zod contracts (pnpm --filter @raadi/events generate).
// The files are committed and registered in Apicurio by registry-init.
import { mkdirSync, writeFileSync } from 'node:fs';
import { EVENT_TYPES } from './contracts.js';
import { jsonSchemaFor } from './json-schema.js';

const dir = new URL('../schemas/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const type of EVENT_TYPES) {
  writeFileSync(new URL(`${type}.json`, dir), `${JSON.stringify(jsonSchemaFor(type), null, 2)}\n`);
}
process.stdout.write(`wrote ${EVENT_TYPES.length} schemas\n`);
