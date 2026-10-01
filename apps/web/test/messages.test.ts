// Every locale must define exactly the same message keys (no missing or stale translations).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

type Tree = { [k: string]: string | Tree };
const load = (l: string): Tree =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), 'utf8'));
const flatten = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );

describe('i18n messages', () => {
  const en = flatten(load('en')).sort();
  for (const locale of ['nb', 'so']) {
    it(`${locale} has the same keys as en`, () =>
      assert.deepEqual(flatten(load(locale)).sort(), en));
    it(`${locale} has no empty strings`, () => {
      const t = load(locale);
      const empty = flatten(t).filter(
        (k) => k.split('.').reduce<Tree | string>((n, p) => (n as Tree)[p]!, t) === '',
      );
      assert.deepEqual(empty, []);
    });
  }
});
