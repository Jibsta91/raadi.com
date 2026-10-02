// Contract test: responses built by the service must satisfy openapi.yaml,
// the same document that generates @raadi/api-client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { imgproxySigner } from '@raadi/service-kit';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import {
  createListingSchema,
  type ListingRow,
  toListing,
  toSnapshot,
} from '../../src/listings/listing.model.js';
import { contracts } from '@raadi/events';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });
const validator = (name: string) => ajv.compile({ $ref: `spec#/components/schemas/${name}` });

const row: ListingRow = {
  id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
  owner_id: '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
  seller_name: 'Kari N.',
  category: 'bil',
  subcategory: 'personbil',
  title: 'Toyota Corolla Hybrid',
  description: 'Service fulgt.',
  price_nok: '189000',
  attributes: {
    make: 'Toyota',
    model: 'Corolla',
    year: 2019,
    mileageKm: 80000,
    fuel: 'hybrid',
    gearbox: 'automatic',
  },
  place_id: 'bergen',
  lat: 60.3913,
  lon: 5.3221,
  image_ids: ['8b2e4d90-5c3a-4f6b-a1d7-2e9c0f3b5a22'],
  status: 'active',
  version: 3,
  created_at: new Date(),
  updated_at: new Date(),
  published_at: new Date(),
  promoted_until: null,
};

describe('OpenAPI contract', () => {
  const signer = imgproxySigner('00'.repeat(32), '11'.repeat(32));

  it('Listing responses match the schema', () => {
    const validate = validator('Listing');
    const listing = toListing(row, signer);
    assert.ok(validate(listing), JSON.stringify(validate.errors));
    assert.equal(listing.priceNok, 189000);
    assert.equal(listing.location.name, 'Bergen');
    const withViewer = { ...listing, viewer: { isOwner: true, canEdit: true, canDelete: true } };
    assert.ok(validate(withViewer), JSON.stringify(validate.errors));
  });

  it('request validation agrees with the CreateListing schema', () => {
    const validate = validator('CreateListing');
    const body = {
      category: 'torget',
      subcategory: 'sport',
      title: 'Ski',
      description: 'Fine',
      priceNok: 100,
      attributes: { condition: 'good' },
      placeId: 'oslo',
    };
    assert.ok(validate(body) && createListingSchema.safeParse(body).success);
    for (const bad of [
      { ...body, ownerId: 'x' },
      { ...body, title: 'x' },
      { ...body, priceNok: -1 },
    ]) {
      assert.ok(!validate(bad));
      assert.ok(!createListingSchema.safeParse(bad).success);
    }
  });

  it('event snapshots satisfy the published event contract', () => {
    const data = { listing: toSnapshot(row) };
    assert.ok(contracts['no.raadi.listings.listing.updated.v1'].safeParse(data).success);
    assert.equal(JSON.stringify(data).includes('Kari'), false, 'no seller name in events');
  });
});
