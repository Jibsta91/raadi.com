import { logger } from './logger';

export interface ComponentStatus {
  name: string;
  group: 'app' | 'platform' | 'observability';
  ok: boolean;
  latencyMs: number;
}

// Internal readiness endpoints. Only up/down and latency are shown publicly.
const CHECKS: Array<Omit<ComponentStatus, 'ok' | 'latencyMs'> & { url: string }> = [
  { name: 'identity-bff', group: 'app', url: 'http://identity-bff:4000/readyz' },
  { name: 'listings', group: 'app', url: 'http://listings:4000/readyz' },
  { name: 'search', group: 'app', url: 'http://search:4000/readyz' },
  { name: 'media', group: 'app', url: 'http://media:4000/readyz' },
  { name: 'messaging', group: 'app', url: 'http://messaging:4000/readyz' },
  { name: 'Keycloak', group: 'platform', url: 'http://keycloak:9000/health/ready' },
  { name: 'OpenBao', group: 'platform', url: 'http://openbao:8200/v1/sys/health' },
  { name: 'Kafka Connect (Debezium)', group: 'platform', url: 'http://kafka-connect:8083/' },
  { name: 'Apicurio Registry', group: 'platform', url: 'http://apicurio:9000/health/ready' },
  { name: 'OpenFGA', group: 'platform', url: 'http://openfga:8080/healthz' },
  { name: 'OPA', group: 'platform', url: 'http://opa:8181/health' },
  { name: 'imgproxy', group: 'platform', url: 'http://imgproxy:8080/health' },
  { name: 'SeaweedFS', group: 'platform', url: 'http://seaweedfs:8333/healthz' },
  { name: 'Grafana', group: 'observability', url: 'http://grafana:3000/api/health' },
  { name: 'Prometheus', group: 'observability', url: 'http://prometheus:9090/-/ready' },
  { name: 'Alertmanager', group: 'observability', url: 'http://alertmanager:9093/-/ready' },
  { name: 'Loki', group: 'observability', url: 'http://loki:3100/ready' },
  { name: 'Tempo', group: 'observability', url: 'http://tempo:3200/ready' },
  { name: 'OpenTelemetry Collector', group: 'observability', url: 'http://otel-collector:13133/' },
];

export async function platformStatus(): Promise<ComponentStatus[]> {
  return Promise.all(
    CHECKS.map(async ({ url, ...c }) => {
      const started = performance.now();
      try {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
        return { ...c, ok: res.ok, latencyMs: Math.round(performance.now() - started) };
      } catch (error) {
        logger.debug({ err: error, component: c.name }, 'status check failed');
        return { ...c, ok: false, latencyMs: Math.round(performance.now() - started) };
      }
    }),
  );
}
