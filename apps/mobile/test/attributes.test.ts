import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { taxonomyMessages } from '../src/i18n/taxonomy.ts';
import { attributeRows } from '../src/lib/attributes.ts';

describe('attributeRows', () => {
  it('translates labels and enum values and formats numbers with units', () => {
    const rows = attributeRows(
      { make: 'Volvo', year: 2019, mileageKm: 85000, fuel: 'electric', bodyType: 'suv' },
      taxonomyMessages.nb,
      'nb-NO',
    );
    assert.deepEqual(
      rows.map((r) => r.label),
      ['Merke', 'Årsmodell', 'Kilometerstand', 'Drivstoff', 'Karosseri'],
    );
    assert.equal(rows[0]!.value, 'Volvo');
    assert.equal(rows[1]!.value, '2019');
    assert.match(rows[2]!.value, /^85\s000 km$/);
    assert.equal(rows[3]!.value, 'Elektrisk');
    assert.equal(rows[4]!.value, 'SUV/Offroad');
  });

  it('keeps unknown keys and values as they are', () => {
    const [row] = attributeRows({ horsepower: 150 }, taxonomyMessages.en, 'en-GB');
    assert.deepEqual(row, { key: 'horsepower', label: 'horsepower', value: '150' });
  });
});
