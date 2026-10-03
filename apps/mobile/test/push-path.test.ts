import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeAppPath } from '../src/lib/push-path.ts';

describe('safeAppPath', () => {
  it('follows plain app paths', () => {
    for (const p of [
      '/messages/0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
      '/my-listings',
      '/account',
      '/',
    ])
      assert.equal(safeAppPath(p), p);
  });

  it('refuses URLs, protocol-relative paths and junk', () => {
    for (const p of [
      'https://evil.example',
      '//evil.example/x',
      'javascript:alert(1)',
      '/messages/../../x?y=1',
      '/a b',
      '\\\\evil',
      '',
      undefined,
      42,
      `/${'a'.repeat(250)}`,
    ])
      assert.equal(safeAppPath(p), null, String(p));
  });
});
