/**
 * Demo conversations (one-shot container, SEED_DEMO_DATA=true only), so the
 * demo users have something in their inboxes. Idempotent: a conversation
 * that already exists is skipped.
 */
import { DEMO_USERS, demoListings } from '@raadi/catalog/demo';
import { createPgPool, loadEnv, loggerOptions } from '@raadi/service-kit';
import { shutdownTelemetry } from '@raadi/service-kit/telemetry';
import { pino } from 'pino';
import { envSchema, loadAppConfig } from './config.js';
import { MessagingRepository } from './messaging/messaging.repository.js';

const log = pino(loggerOptions('messaging-seed'));
const [, ola, amina] = DEMO_USERS;

/**
 * [demo listing index, buyer, messages as [from the buyer?, text]]. Listing 0
 * belongs to Kari and listing 2 to Amina (see demoListings).
 */
const SCRIPT = [
  [
    0,
    amina,
    [
      [true, 'Hei! Er denne fortsatt til salgs?'],
      [false, 'Hei, ja den er det. Du kan hente den når det passer.'],
      [true, 'Flott, kan jeg komme på lørdag?'],
    ],
  ],
  [2, ola, [[true, 'Hi! Could you send a few more photos?']]],
] as const;

async function main(): Promise<void> {
  if (loadEnv(envSchema).SEED_DEMO_DATA !== 'true') {
    log.info('SEED_DEMO_DATA is not true; nothing to do');
    return;
  }
  const { env, secrets } = await loadAppConfig();
  const pool = createPgPool(env, secrets.db_password, 'messaging-seed');
  const repo = new MessagingRepository(pool);
  const listings = demoListings();
  let created = 0;
  try {
    for (const [index, buyer, messages] of SCRIPT) {
      const listing = listings[index]!;
      if (await repo.findByListingAndBuyer(listing.id, buyer.id)) continue;
      const [[, first], ...rest] = messages;
      const { conversation } = await repo.start(
        {
          listingId: listing.id,
          listingTitle: listing.title,
          listingImageId: listing.images[0]?.id ?? null,
          sellerId: listing.ownerId,
          sellerName: listing.sellerName,
          buyerId: buyer.id,
          buyerName: buyer.sellerName,
        },
        first,
      );
      for (const [fromBuyer, text] of rest) {
        await repo.send(conversation.id, fromBuyer ? buyer.id : listing.ownerId, text);
      }
      created++;
    }
    log.info({ created, total: SCRIPT.length }, 'demo conversations seeded');
  } finally {
    await pool.end();
    await shutdownTelemetry();
  }
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'seeding failed');
  process.exit(1);
});
