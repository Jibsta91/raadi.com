import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { EVENT_TYPES } from '../src/contracts.js';
import { buildEvent, InvalidEventError, parseEvent } from '../src/envelope.js';
import { jsonSchemaFor } from '../src/json-schema.js';

const userId = '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11';

describe('event contracts', () => {
  it('builds valid CloudEvents with a dataschema', () => {
    const e = buildEvent('no.raadi.identity.user.registered.v1', {
      source: 'urn:raadi:identity-bff',
      subject: userId,
      data: { userId, locale: 'nb' },
    });
    assert.equal(e.specversion, '1.0');
    assert.match(
      e.dataschema!,
      /no\.raadi\.events\/artifacts\/no\.raadi\.identity\.user\.registered\.v1$/,
    );
    assert.deepEqual(parseEvent(JSON.parse(JSON.stringify(e))), e);
  });

  it('rejects data that breaks the contract', () => {
    assert.throws(() =>
      buildEvent('no.raadi.identity.user.registered.v1', {
        source: 's',
        subject: userId,
        data: { userId, locale: 'de' as 'nb' },
      }),
    );
    const bad = {
      specversion: '1.0',
      id: userId,
      source: 's',
      type: 'no.raadi.media.media.deleted.v1',
      time: new Date().toISOString(),
      data: {},
    };
    assert.throws(() => parseEvent(bad), InvalidEventError);
  });

  it('ignores unknown event types (forward compatibility)', () => {
    const future = {
      specversion: '1.0',
      id: userId,
      source: 's',
      type: 'no.raadi.x.y.v9',
      time: new Date().toISOString(),
      data: {},
    };
    assert.equal(parseEvent(future), null);
  });

  it('committed JSON Schemas match the zod contracts (run `generate` after changes)', () => {
    for (const type of EVENT_TYPES) {
      const file = new URL(`../../schemas/${type}.json`, import.meta.url);
      assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), jsonSchemaFor(type), type);
    }
  });
});
