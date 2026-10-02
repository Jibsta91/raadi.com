import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSearch, searchParamsSchema } from '../../src/search/query.js';

const parse = (q: Record<string, string>) => searchParamsSchema.parse(q);

describe('search parameters', () => {
  it('parses comma-separated facets and defaults', () => {
    const p = parse({ category: 'bil,torget', county: 'oslo' });
    assert.deepEqual(p.category, ['bil', 'torget']);
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 24);
    assert.equal(p.sort, 'relevance');
  });

  it('rejects unknown facet values, places and inconsistent ranges', () => {
    for (const bad of [
      { category: 'boats' },
      { near: 'atlantis' },
      { priceMin: '10', priceMax: '5' },
      { lat: '59.9' },
      { sort: 'distance' },
      { pageSize: '500' },
      { foo: 'bar' },
    ]) {
      assert.ok(!searchParamsSchema.safeParse(bad).success, JSON.stringify(bad));
    }
  });
});

describe('query builder', () => {
  it('only ever returns active listings', () => {
    const body = buildSearch(parse({}));
    assert.deepEqual(body.query.bool.filter[0], { term: { status: 'active' } });
    assert.deepEqual(body.query.bool.must, [{ match_all: {} }]);
    // Relevance ranks running promotions first, without filtering anything out.
    assert.deepEqual(body.query.bool.should, [
      { constant_score: { filter: { range: { promotedUntil: { gt: 'now' } } }, boost: 1000 } },
    ]);
  });

  it('full text is fuzzy and boosts titles', () => {
    const body = buildSearch(parse({ q: 'langrennski' }));
    const mm = (body.query.bool.must[0] as { multi_match: { fields: string[]; fuzziness: string } })
      .multi_match;
    assert.equal(mm.fuzziness, 'AUTO');
    assert.equal(mm.fields[0], 'title^3');
  });

  it('applies a facet to the hits and to other facets, but not to its own counts', () => {
    const body = buildSearch(parse({ category: 'bil', county: 'oslo' }));
    const post = body.post_filter.bool.filter;
    assert.equal(post.length, 2);
    const catAgg = body.aggs.category as { filter: { bool: { filter: object[] } } };
    assert.deepEqual(catAgg.filter.bool.filter, [{ terms: { county: ['oslo'] } }]);
    const countyAgg = body.aggs.county as { filter: { bool: { filter: object[] } } };
    assert.deepEqual(countyAgg.filter.bool.filter, [{ terms: { category: ['bil'] } }]);
  });

  it('geo radius around a place, with distance sort and computed distances', () => {
    const body = buildSearch(parse({ near: 'bergen', radiusKm: '25', sort: 'distance' }));
    assert.deepEqual(body.query.bool.filter[1], {
      geo_distance: { distance: '25km', location: { lat: 60.3913, lon: 5.3221 } },
    });
    assert.ok('_geo_distance' in (body.sort[0] as object));
    assert.equal(body.query.bool.should, undefined, 'explicit sorts ignore promotions');
    assert.ok(body.script_fields?.distance_km);
  });

  it('paginates', () => {
    const body = buildSearch(parse({ page: '3', pageSize: '10' }));
    assert.equal(body.from, 20);
    assert.equal(body.size, 10);
  });
});
