# Service down / unhealthy

**Alerts:** `ScrapeTargetDown`, `ServiceStoppedReportingTelemetry`. **Severity:** critical/warning.

1. **Find the failing container**
   ```bash
   ./raadi ps                      # look for "unhealthy", "Restarting" or "Exited (non-zero)"
   docker compose logs --tail=200 <service>
   ```
   Every log line is JSON. In Grafana → Explore → Loki: `{service_name="<service>"} | json | level=~"error|fatal"`.
2. **Read the health detail.** Application services expose `/readyz` with per-dependency results:
   ```bash
   docker compose exec identity-bff /nodejs/bin/node -e \
     "fetch('http://127.0.0.1:4000/readyz').then(r=>r.text()).then(console.log)"
   ```
   A failing dependency (postgres, valkey, keycloak) is the real problem. Follow its runbook.
3. **Common causes**
   | Symptom in logs                                 | Cause                       | Fix                                                                     |
   | ----------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
   | `Invalid configuration: …`                      | Missing/invalid env var     | Fix `.env`, then `docker compose up -d <service>`                       |
   | `OpenBaoError … 403/400` at startup             | AppRole credentials invalid | [openbao.md → re-issue AppRole](openbao.md#re-issue-a-services-approle) |
   | `ECONNREFUSED postgres:5432`                    | Postgres down or restarting | `docker compose logs postgres`; check disk space                        |
   | OOMKilled (`docker inspect … .State.OOMKilled`) | Memory limit too low        | Raise the limit in the compose slice / `compose.prod.yaml`              |
4. **Restart the one service** (stateless, safe): `docker compose up -d --force-recreate <service>`.
5. **Verify:** `./raadi smoke` (development) or the status page `https://<domain>/en/status`.
