import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  // Self-contained server bundle for the distroless runtime image.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  // `next dev` behind the gateway (compose.dev.yaml) is reached via the public host name.
  allowedDevOrigins: [process.env.RAADI_DOMAIN ?? 'raadi.localhost'],
  // Listing images are resized by imgproxy (Phase 2), not by Next.js.
  images: { unoptimized: true },
  transpilePackages: ['@raadi/ui', '@raadi/api-client'],
  // pino uses worker threads and must not be bundled.
  serverExternalPackages: ['pino'],
};

export default withNextIntl(config);
