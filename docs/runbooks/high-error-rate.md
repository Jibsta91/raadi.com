# High error rate or latency at the gateway

**Alerts:** `GatewayHighErrorRate` (>5% 5xx for 5 min), `GatewayHighLatency` (p95 > 1 s for 10 min).

1. Open **Grafana → Raadi · Gateway** and find which `service` is affected and when it started.
2. Jump from the error panel to traces: **Explore → Tempo**, query
   `{ resource.service.name = "<service>" && status = error }`, then follow the trace's logs (trace→logs link).
3. Check recent changes: was there a deploy (`docker compose ps` → container age) or a config change?
4. Saturation: **Raadi · Service health** for event-loop delay and heap, `docker stats` for CPU and memory
   limits.
5. Mitigate:
   - A bad release: roll back to the previous image tag (production: re-run the Deploy workflow with the previous
     tag; it also rolls back automatically when health checks fail).
   - A failing dependency (e.g. Keycloak): restore the dependency first. Circuit breakers in `identity-bff`
     fail fast in the meantime.
   - Abusive traffic (many 429/403): see [auth-anomalies.md](auth-anomalies.md).
6. Record the incident (time, impact, cause, fix) in the team's incident log.
