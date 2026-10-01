import type { InboxRow } from '../../src/messaging/model.js';

const buyer = '8b2e4d90-5c3a-4f6b-a1d7-2e9c0f3b5a22';
const seller = '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11';

export const inboxRow: InboxRow = {
  id: '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
  listing_id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
  listing_title: 'Racersykkel',
  listing_image_id: '7a1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
  seller_id: seller,
  seller_name: 'Kari N.',
  buyer_id: buyer,
  buyer_name: 'Ola N.',
  created_at: new Date('2026-10-01T10:00:00Z'),
  last_message_at: new Date('2026-10-01T10:05:00Z'),
  buyer_read_at: new Date('2026-10-01T10:05:00Z'),
  seller_read_at: new Date(0),
  last_body: 'Er den ledig?',
  last_sender_id: buyer,
  last_sent_at: new Date('2026-10-01T10:05:00Z'),
  unread: '2',
};
