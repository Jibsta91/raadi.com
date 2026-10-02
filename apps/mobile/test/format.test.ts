import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAge, formatPrice, pickLocale } from '../src/lib/format.ts';

describe('formatPrice', () => {
  it('formats whole kroner with a Norwegian thousands separator', () => {
    assert.match(formatPrice(12500, 'nb', 'Pris på forespørsel'), /^12\s500 kr$/);
  });
  it('uses the caller label when there is no price', () => {
    assert.equal(formatPrice(null, 'en', 'Price on request'), 'Price on request');
  });
  it('keeps zero as a price', () => {
    assert.equal(formatPrice(0, 'en', 'n/a'), '0 kr');
  });
});

describe('formatAge', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  it('says minutes for recent times', () => {
    assert.match(formatAge('2026-10-02T11:55:00Z', 'en', now), /5 min/);
  });
  it('says days within a week', () => {
    assert.match(formatAge('2026-09-30T12:00:00Z', 'en', now), /2 days ago|2 days/);
  });
  it('falls back to a date after a week', () => {
    assert.match(formatAge('2026-08-01T12:00:00Z', 'en', now), /2026/);
  });
});

describe('pickLocale', () => {
  it('maps Norwegian variants to nb', () => {
    assert.equal(pickLocale(['nn-NO']), 'nb');
    assert.equal(pickLocale(['no']), 'nb');
  });
  it('takes the first supported language', () => {
    assert.equal(pickLocale(['de-DE', 'so-SO', 'en-US']), 'so');
  });
  it('defaults to nb', () => {
    assert.equal(pickLocale(['fr-FR']), 'nb');
    assert.equal(pickLocale([]), 'nb');
  });
});
