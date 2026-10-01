// Loaded with `node --import` before the application so instrumentation can
// patch http, pino etc. as they are imported.
import { startTelemetry } from '@raadi/service-kit/telemetry';

startTelemetry({ serviceName: 'search' });
