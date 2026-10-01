// Contract test: responses built by the service must satisfy openapi.yaml,
// the same document that generates @raadi/api-client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildEvent } from '@raadi/events';
import { imgproxySigner } from '@raadi/service-kit';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { toConversation, toMessage } from '../../src/messaging/model.js';
import { inboxRow } from './fixtures.js';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });
const validator = (name: string) => ajv.compile({ $ref: `spec#/components/schemas/${name}` });
const signer = imgproxySigner('00'.repeat(32), '11'.repeat(32));

function assertValid(name: string, value: unknown) {
  const validate = validator(name);
  assert.ok(validate(value), `${name}: ${JSON.stringify(validate.errors)}`);
}

describe('OpenAPI contract', () => {
  const conversation = toConversation(inboxRow, inboxRow.buyer_id, signer);
  const message = toMessage(
    {
      id: '1d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
      conversation_id: inboxRow.id,
      sender_id: inboxRow.seller_id,
      body: 'Ja, den er ledig.',
      created_at: new Date('2026-10-01T10:06:00Z'),
    },
    inboxRow.buyer_id,
  );

  it('Conversation, also without image or messages', () => {
    assertValid('Conversation', conversation);
    assertValid(
      'Conversation',
      toConversation(
        {
          ...inboxRow,
          listing_image_id: null,
          last_body: null,
          last_sender_id: null,
          last_sent_at: null,
        },
        inboxRow.seller_id,
        signer,
      ),
    );
  });

  it('Message, ConversationDetail, StartedConversation and ConversationPage', () => {
    assertValid('Message', message);
    assertValid('ConversationDetail', { ...conversation, messages: [message], hasMore: false });
    assertValid('StartedConversation', { conversation, message });
    assertValid('ConversationPage', { total: 1, limit: 20, offset: 0, items: [conversation] });
  });

  it('the message_sent event carries ids only', () => {
    const event = buildEvent('no.raadi.messaging.conversation.message_sent.v1', {
      source: 'urn:raadi:messaging',
      subject: inboxRow.id,
      data: {
        conversationId: inboxRow.id,
        messageId: message.id,
        listingId: inboxRow.listing_id,
        senderId: inboxRow.seller_id,
        recipientId: inboxRow.buyer_id,
        sentAt: message.sentAt,
      },
    });
    assert.ok(!JSON.stringify(event).includes(message.body));
  });
});
