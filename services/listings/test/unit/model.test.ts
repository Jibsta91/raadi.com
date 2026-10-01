import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createListingSchema,
  mergedListingSchema,
  sellerName,
  updateListingSchema,
} from '../../src/listings/listing.model.js';

const valid = {
  category: 'torget',
  subcategory: 'sport',
  title: 'Langrennsski',
  description: 'Lite brukt',
  priceNok: 1500,
  attributes: { condition: 'good' },
  placeId: 'oslo',
};

const issues = (input: unknown) => {
  const r = createListingSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('listing validation', () => {
  it('accepts a valid listing and defaults images to none', () => {
    const r = createListingSchema.parse(valid);
    assert.deepEqual(r.imageIds, []);
  });

  it('checks the subcategory belongs to the category', () => {
    assert.deepEqual(issues({ ...valid, subcategory: 'personbil' }), ['subcategory']);
  });

  it('validates category-specific attributes', () => {
    assert.deepEqual(issues({ ...valid, attributes: { condition: 'broken' } }), [
      'attributes.condition',
    ]);
    assert.deepEqual(issues({ ...valid, attributes: { condition: 'good', colour: 'red' } }), [
      'attributes',
    ]);
  });

  it('requires a price except for jobs, which must have none', () => {
    assert.deepEqual(issues({ ...valid, priceNok: null }), ['priceNok']);
    const job = {
      ...valid,
      category: 'jobb',
      subcategory: 'it',
      attributes: { employer: 'Nordlys AS', employmentType: 'full_time' },
    };
    assert.deepEqual(issues({ ...job, priceNok: 600000 }), ['priceNok']);
    assert.deepEqual(issues({ ...job, priceNok: null }), []);
  });

  it('rejects unknown places, duplicate images and unknown fields', () => {
    assert.deepEqual(issues({ ...valid, placeId: 'atlantis' }), ['placeId']);
    const id = '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11';
    assert.deepEqual(issues({ ...valid, imageIds: [id, id] }), ['imageIds']);
    assert.deepEqual(issues({ ...valid, ownerId: id }), ['']);
  });

  it('PATCH accepts partial bodies, and the merged result is validated as a whole', () => {
    assert.ok(updateListingSchema.safeParse({ status: 'sold' }).success);
    assert.ok(!updateListingSchema.safeParse({}).success);
    assert.ok(!updateListingSchema.safeParse({ status: 'deleted' }).success);
    const merged = mergedListingSchema.safeParse({ ...valid, imageIds: [], category: 'bil' });
    assert.ok(!merged.success, 'switching category without matching attributes fails');
  });
});

describe('seller name', () => {
  it('uses the given name and family initial, never the e-mail', () => {
    assert.equal(
      sellerName({ given_name: 'Kari', family_name: 'nordmann', email: 'k@x' }),
      'Kari N.',
    );
    assert.equal(sellerName({ given_name: 'Amina' }), 'Amina');
    assert.equal(sellerName({ email: 'k@x' }), 'Raadi-bruker');
  });
});
