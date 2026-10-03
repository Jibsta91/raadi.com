import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { absoluteUrl, safeAppPath, websocketUrl } from '../src/lib/urls.ts';

describe('absoluteUrl', () => {
  it('prefixes gateway-relative paths with the base URL', () => {
    assert.equal(
      absoluteUrl('/img/abc/rs:fit:300/x.jpg', 'http://raadi.localhost/'),
      'http://raadi.localhost/img/abc/rs:fit:300/x.jpg',
    );
  });
  it('leaves absolute URLs alone', () => {
    assert.equal(
      absoluteUrl('https://cdn.example/x.jpg', 'http://raadi.localhost'),
      'https://cdn.example/x.jpg',
    );
  });
  it('keeps relative paths relative on the web (no base URL)', () => {
    assert.equal(absoluteUrl('/img/x.jpg', ''), '/img/x.jpg');
  });
});

describe('websocketUrl', () => {
  it('maps http to ws and https to wss', () => {
    assert.equal(
      websocketUrl('http://raadi.localhost', '/api/v1/messaging/ws'),
      'ws://raadi.localhost/api/v1/messaging/ws',
    );
    assert.equal(
      websocketUrl('https://raadi.no', '/api/v1/messaging/ws'),
      'wss://raadi.no/api/v1/messaging/ws',
    );
  });
});

describe('safeAppPath', () => {
  it('accepts in-app paths', () => {
    assert.equal(safeAppPath('/listings/1', '/'), '/listings/1');
  });
  it('rejects other origins and protocol-relative URLs', () => {
    assert.equal(safeAppPath('https://evil.example', '/'), '/');
    assert.equal(safeAppPath('//evil.example', '/'), '/');
    assert.equal(safeAppPath('/\\evil.example', '/'), '/');
    assert.equal(safeAppPath(undefined, '/'), '/');
  });
});
