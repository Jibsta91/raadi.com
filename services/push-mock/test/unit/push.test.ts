import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PushInbox } from '../../src/push.js';

describe('push mock', () => {
  it('accepts one message or a batch and keeps what arrived per token', () => {
    const inbox = new PushInbox();
    const one = inbox.send({ to: 'ExponentPushToken[aaa]', title: 'Raadiso', body: 'Hi' });
    assert.ok('data' in one && one.data[0]!.status === 'ok');
    const batch = inbox.send([
      { to: ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]'], body: 'Two' },
    ]);
    assert.ok('data' in batch && batch.data.length === 2);
    assert.equal(inbox.list('ExponentPushToken[aaa]').length, 2);
    assert.equal(inbox.list('ExponentPushToken[aaa]')[0]!.body, 'Two');
    assert.equal(inbox.list().length, 3);
  });

  it('answers DeviceNotRegistered for unregistered or malformed tokens', () => {
    const inbox = new PushInbox();
    const res = inbox.send([{ to: 'ExponentPushToken[Unregistered-1]' }, { to: 'not-a-token' }]);
    assert.ok('data' in res);
    for (const t of res.data) {
      assert.equal(t.status, 'error');
      assert.equal(t.status === 'error' && t.details.error, 'DeviceNotRegistered');
    }
    assert.equal(inbox.list().length, 0);
  });

  it('rejects invalid requests and more than 100 notifications', () => {
    const inbox = new PushInbox();
    assert.ok('errors' in inbox.send({ title: 'no recipient' }));
    const many = Array.from({ length: 101 }, (_, i) => ({ to: `ExponentPushToken[${i}]` }));
    assert.ok('errors' in inbox.send(many));
  });

  it('forgets the oldest messages beyond its capacity', () => {
    const inbox = new PushInbox(2);
    for (const n of [1, 2, 3]) inbox.send({ to: 'ExponentPushToken[x]', body: String(n) });
    assert.deepEqual(
      inbox.list().map((d) => d.body),
      ['3', '2'],
    );
  });
});
