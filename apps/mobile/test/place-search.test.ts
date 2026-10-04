import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLACES } from '../../../packages/catalog/src/places.ts';
import { fold, searchPlaces } from '../src/lib/place-search.ts';

describe('searchPlaces', () => {
  it('folds Norwegian letters', () => {
    assert.equal(fold('Tromsø'), 'tromso');
    assert.equal(fold('Ålesund'), 'aalesund');
    assert.equal(fold('Bærum'), 'baerum');
  });

  it('finds places by prefix first, then by substring, without accents', () => {
    const hits = searchPlaces(PLACES, 'tromso');
    assert.equal(hits[0]?.name, 'Tromsø');
    assert.ok(searchPlaces(PLACES, 'ber').some((p) => p.name === 'Bergen'));
    assert.deepEqual(searchPlaces(PLACES, '   '), []);
    assert.ok(searchPlaces(PLACES, 'e', 3).length <= 3);
  });
});
