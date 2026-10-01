// Contract test: the media view the service returns satisfies openapi.yaml.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { imgproxySigner } from '@raadi/service-kit';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { MediaService } from '../../src/media/media.service.js';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });

describe('OpenAPI contract', () => {
  it('Media responses match the schema', () => {
    const service = new MediaService(
      {} as never,
      { mediaBucket: 'raadi-media' } as never,
      {} as never,
      {} as never,
      {} as never,
      imgproxySigner('00'.repeat(32), '11'.repeat(32)),
    );
    const view = service.view({
      id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
      owner_id: '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
      status: 'ready',
      content_type: 'image/jpeg',
      bytes: 123456,
      width: 1600,
      height: 1200,
      sha256: 'x',
      rejection_reason: null,
      listing_id: null,
      created_at: new Date(),
      attached_at: null,
    });
    const validate = ajv.compile({ $ref: 'spec#/components/schemas/Media' });
    assert.ok(validate(view), JSON.stringify(validate.errors));
    assert.equal(JSON.stringify(view).includes('3f0c5a6e'), false, 'owner id is not exposed');
  });
});
