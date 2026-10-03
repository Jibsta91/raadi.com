import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_LISTING_COUNT,
  DEMO_LISTINGS_PER_USER,
  DEMO_USERS,
  demoListings,
  demoUuid,
} from '../src/demo.js';
import { distanceKm, findPlace, PLACES } from '../src/places.js';
import {
  attributeSchemas,
  CATEGORIES,
  CATEGORY_KEYS,
  FACET_ATTRIBUTES,
  isSubcategoryOf,
  priceRequired,
  RANGE_ATTRIBUTES,
} from '../src/taxonomy.js';

describe('places', () => {
  it('has unique ids and plausible Norwegian coordinates', () => {
    assert.equal(new Set(PLACES.map((p) => p.id)).size, PLACES.length);
    for (const p of PLACES) {
      assert.ok(p.lat > 57.9 && p.lat < 71.2, p.id);
      assert.ok(p.lon > 4.5 && p.lon < 31.2, p.id);
    }
  });

  it('computes great-circle distances', () => {
    const d = distanceKm(findPlace('oslo')!, findPlace('bergen')!);
    assert.ok(d > 300 && d < 310, `Oslo–Bergen is ~305 km, got ${d}`);
  });
});

describe('demo dataset', () => {
  const listings = demoListings();

  it('is deterministic', () => {
    assert.deepEqual(demoListings(), listings);
    assert.equal(demoUuid('listing-0'), listings[0]!.id);
    assert.match(
      listings[0]!.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is valid against the taxonomy', () => {
    assert.equal(listings.length, DEMO_LISTING_COUNT);
    for (const l of listings) {
      assert.ok(isSubcategoryOf(l.category, l.subcategory), `${l.category}/${l.subcategory}`);
      const parsed = attributeSchemas[l.category].safeParse(l.attributes);
      assert.ok(parsed.success, `${l.id}: ${JSON.stringify(parsed.error?.issues)}`);
      assert.equal(l.priceNok === null, !priceRequired(l.category));
      assert.ok(l.images.length >= 1 && l.images.length <= 3);
    }
  });

  it('keeps every seller under the active-listing quota (OPA: 50)', () => {
    const perOwner = new Map<string, number>();
    for (const l of listings) perOwner.set(l.ownerId, (perOwner.get(l.ownerId) ?? 0) + 1);
    for (const [owner, n] of perOwner) assert.ok(n < 50, `${owner} owns ${n}`);
    for (const u of DEMO_USERS) assert.equal(perOwner.get(u.id), DEMO_LISTINGS_PER_USER);
  });

  it('covers every category and has unique image ids', () => {
    for (const c of Object.keys(CATEGORIES))
      assert.ok(
        listings.some((l) => l.category === c),
        c,
      );
    const ids = listings.flatMap((l) => l.images.map((i) => i.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  it('covers every subcategory, so each category page has listings in every tile', () => {
    for (const [c, subs] of Object.entries(CATEGORIES))
      for (const s of subs)
        assert.ok(
          listings.some((l) => l.category === c && l.subcategory === s),
          `${c}/${s}`,
        );
  });
});

describe('search filters', () => {
  it('only names attributes that the category schema has', () => {
    for (const c of CATEGORY_KEYS) {
      const keys = Object.keys(attributeSchemas[c].shape);
      for (const f of FACET_ATTRIBUTES[c]) assert.ok(keys.includes(f), `${c}.${f}`);
      for (const r of RANGE_ATTRIBUTES[c]) assert.ok(keys.includes(r.field), `${c}.${r.field}`);
    }
  });
});
