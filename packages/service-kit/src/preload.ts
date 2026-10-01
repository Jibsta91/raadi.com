/**
 * Generic telemetry preload for processes we do not bundle ourselves (e.g. the
 * Next.js standalone server):  node --import <service-kit>/dist/preload.js server.js
 * The service name comes from OTEL_SERVICE_NAME.
 */
import { startTelemetry } from './telemetry.js';

startTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'unknown-service' });
