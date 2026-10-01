import type { INestApplication } from '@nestjs/common';
import type { HealthRegistry } from './health.js';
import { shutdownTelemetry } from './telemetry.js';

/**
 * Graceful shutdown: on SIGTERM/SIGINT mark the instance as draining (readiness
 * fails, the gateway stops routing to it), wait for in-flight requests, close
 * the app (Nest runs onModuleDestroy/beforeApplicationShutdown hooks, closing
 * pools), then flush telemetry.
 */
export function installGracefulShutdown(
  app: INestApplication,
  health: HealthRegistry,
  opts: { drainMs: number; log: (msg: string) => void },
): void {
  let shuttingDown = false;
  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    opts.log(`received ${signal}, draining for ${opts.drainMs}ms`);
    health.startDraining();
    setTimeout(async () => {
      const hardStop = setTimeout(() => process.exit(1), 15_000);
      hardStop.unref();
      try {
        await app.close();
        await shutdownTelemetry();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    }, opts.drainMs).unref();
  };
  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}
