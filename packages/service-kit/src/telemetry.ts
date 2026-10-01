/**
 * OpenTelemetry bootstrap. Load it before anything else:
 *   node --import ./dist/telemetry.js ./dist/main.js
 * Exports traces, metrics and logs over OTLP/HTTP to the collector configured
 * by the standard OTEL_* environment variables.
 */
import { register } from 'node:module';
import { diag, DiagLogLevel, type DiagLogger } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
}

let sdk: NodeSDK | undefined;

/** Writes OTel's own diagnostics as JSON lines so they match service logs. */
const jsonDiag =
  (level: string) =>
  (message: string, ...args: unknown[]) =>
    process.stderr.write(
      `${JSON.stringify({ level, time: new Date().toISOString(), msg: message, args, component: 'otel' })}\n`,
    );

export function startTelemetry({
  serviceName,
  serviceVersion,
}: TelemetryOptions): NodeSDK | undefined {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') return sdk;

  // ESM support: lets instrumentations patch modules loaded via `import`.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const logger: DiagLogger = {
    error: jsonDiag('error'),
    warn: jsonDiag('warn'),
    info: () => undefined,
    debug: () => undefined,
    verbose: () => undefined,
  };
  diag.setLogger(logger, DiagLogLevel.WARN);

  // Stable HTTP semantic conventions (http.server.request.duration etc.).
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion ?? process.env.RAADI_VERSION ?? 'dev',
      'service.namespace': 'raadi',
      'deployment.environment.name': process.env.RAADI_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 15000),
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => /^\/(healthz|readyz)/.test(req.url ?? ''),
        },
        // Correlate logs with traces and forward pino records as OTel logs.
        '@opentelemetry/instrumentation-pino': { disableLogSending: false },
      }),
    ],
  });
  sdk.start();
  return sdk;
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined);
}
