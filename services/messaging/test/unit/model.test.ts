import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imgproxySigner } from '@raadi/service-kit';
import {
  sendMessageSchema,
  startConversationSchema,
  toConversation,
  toMessage,
} from '../../src/messaging/model.js';
import { personalise } from '../../src/messaging/realtime.js';
import { inboxRow } from './fixtures.js';

const buyer = inboxRow.buyer_id;
const seller = inboxRow.seller_id;
const signer = imgproxySigner('00'.repeat(32), '11'.repeat(32));

describe('message input', () => {
  it('trims text and rejects empty, oversized and control-character messages', () => {
    assert.equal(sendMessageSchema.parse({ body: '  Hei!\n ' }).body, 'Hei!');
    assert.equal(sendMessageSchema.safeParse({ body: '   ' }).success, false);
    assert.equal(sendMessageSchema.safeParse({ body: 'x'.repeat(2001) }).success, false);
    assert.equal(sendMessageSchema.safeParse({ body: 'a\u0007b' }).success, false);
    assert.equal(sendMessageSchema.safeParse({ body: 'line 1\nline 2\ttab' }).success, true);
    assert.equal(sendMessageSchema.safeParse({ body: 'hi', extra: 1 }).success, false);
    assert.equal(
      startConversationSchema.safeParse({ listingId: 'nope', body: 'hi' }).success,
      false,
    );
  });
});

describe('per-viewer views', () => {
  it('shows each participant the other one, and their own role', () => {
    const forBuyer = toConversation(inboxRow, buyer, signer);
    const forSeller = toConversation(inboxRow, seller, signer);
    assert.equal(forBuyer.role, 'buyer');
    assert.deepEqual(forBuyer.counterpart, { id: seller, name: 'Kari N.' });
    assert.equal(forBuyer.lastMessage?.fromMe, true);
    assert.equal(forSeller.role, 'seller');
    assert.deepEqual(forSeller.counterpart, { id: buyer, name: 'Ola N.' });
    assert.equal(forSeller.lastMessage?.fromMe, false);
    assert.equal(forSeller.unread, 2);
    assert.match(forBuyer.listing.image!.thumb, /^\/img\/[\w-]+\/pr:thumb\//);
  });

  it('personalises live events for each recipient', () => {
    const message = {
      id: '1d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
      conversation_id: inboxRow.id,
      sender_id: buyer,
      body: 'Hei',
      // Live events travel as JSON, so the date arrives as a string.
      created_at: '2026-10-01T10:06:00.000Z' as unknown as Date,
    };
    const event = { type: 'message' as const, participants: [buyer, seller], message };
    assert.deepEqual(personalise(event, seller), {
      type: 'message',
      message: toMessage({ ...message, created_at: new Date(message.created_at) }, seller),
    });
    const toSeller = personalise(event, seller);
    assert.equal(toSeller.type === 'message' && toSeller.message.fromMe, false);
    const read = {
      type: 'read' as const,
      participants: [buyer, seller],
      conversationId: inboxRow.id,
      readerId: seller,
    };
    assert.deepEqual(personalise(read, seller), {
      type: 'read',
      conversationId: inboxRow.id,
      byMe: true,
    });
  });
});
