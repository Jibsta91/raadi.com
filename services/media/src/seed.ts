/**
 * Demo image seeder (one-shot container, SEED_DEMO_DATA=true only). For every
 * image of the deterministic demo listings it renders an illustration (SVG ->
 * JPEG through imgproxy), stores it attached to its listing and writes the
 * owner tuple. Idempotent: images that already exist are skipped.
 */
import { type DemoImage, type DemoListing, demoListings } from '@raadi/catalog/demo';
import {
  createPgPool,
  FgaClient,
  imgproxySigner,
  loadEnv,
  loggerOptions,
  retry,
} from '@raadi/service-kit';
import { shutdownTelemetry } from '@raadi/service-kit/telemetry';
import { pino } from 'pino';
import { envSchema, loadAppConfig } from './config.js';
import { demoSvg } from './demo-art.js';
import { ImageSanitizer } from './media/imaging.js';
import { MediaRepository } from './media/media.repository.js';
import { MediaStorage } from './media/storage.js';

const log = pino(loggerOptions('media-seed'));

async function main(): Promise<void> {
  if (loadEnv(envSchema).SEED_DEMO_DATA !== 'true') {
    log.info('SEED_DEMO_DATA is not true; nothing to do');
    return;
  }
  const { env, secrets } = await loadAppConfig();
  const pool = createPgPool(env, secrets.db_password, 'media-seed');
  const storage = new MediaStorage(env, secrets.s3_secret);
  const sanitizer = new ImageSanitizer(
    env.IMGPROXY_INTERNAL_URL,
    imgproxySigner(secrets['imgproxy.key'], secrets['imgproxy.salt']),
  );
  const fga = new FgaClient({ url: env.OPENFGA_URL, apiKey: secrets.fga_key });
  const repo = new MediaRepository(pool);
  await storage.ensureBuckets();

  const jobs = demoListings().flatMap((l) => l.images.map((image) => ({ listing: l, image })));
  let created = 0;
  let next = 0;
  const seedImage = async (listing: DemoListing, image: DemoImage) => {
    const staging = `seed-${image.id}.svg`;
    await storage.put(storage.uploadBucket, staging, Buffer.from(demoSvg(image)), 'image/svg+xml');
    const jpeg = await sanitizer.sanitize(`s3://${storage.uploadBucket}/${staging}`, 1280);
    await storage.delete(storage.uploadBucket, staging);
    await storage.put(storage.mediaBucket, image.id, jpeg.data, 'image/jpeg');
    const row = await repo.createReady(
      {
        id: image.id,
        ownerId: listing.ownerId,
        contentType: 'image/jpeg',
        bytes: jpeg.data.length,
        width: jpeg.width,
        height: jpeg.height,
        sha256: 'demo',
        listingId: listing.id,
      },
      () =>
        fga.write([
          { user: `user:${listing.ownerId}`, relation: 'owner', object: `media:${image.id}` },
        ]),
    );
    if (row) created++;
  };
  const worker = async () => {
    for (let job = jobs[next++]; job; job = jobs[next++]) {
      const { listing, image } = job;
      if (await repo.findById(image.id)) continue;
      // On a cold start imgproxy shares the machine with every JVM booting at
      // once and can time out; each image is idempotent, so retry patiently.
      await retry(() => seedImage(listing, image), {
        retries: 6,
        baseDelayMs: 1_000,
        maxDelayMs: 15_000,
        onRetry: (err, attempt, delayMs) =>
          log.warn({ err, imageId: image.id, attempt, delayMs }, 'retrying demo image'),
      });
    }
  };
  try {
    await Promise.all(Array.from({ length: 3 }, worker));
    log.info({ created, total: jobs.length }, 'demo images seeded');
  } finally {
    storage.close();
    await pool.end();
    await shutdownTelemetry();
  }
}

main().catch((error: unknown) => {
  log.fatal({ err: error }, 'seeding failed');
  process.exit(1);
});
