# Authentication anomalies (credential stuffing, account takeover)

**Alert:** `AuthLoginFailuresSpike` (> 1 failed login/s for 5 min).

1. **Size it:** Grafana → Raadi · Service health → "Logins by outcome". Keycloak events are in the Keycloak
   admin console → _Events_ (login events are stored for 30 days).
2. **Find sources:** Loki: `{service_name="traefik"} | json | RequestPath=~"/realms/.*/login-actions/.*"`,
   grouped by `ClientHost`.
3. **Protections already active:**
   - Keycloak brute-force detection (temporary lockout after 10 failures, backing off up to 15 min).
   - Traefik per-IP rate limit on `/auth` and Keycloak routes.
4. **Respond:**
   - Block abusive IP ranges at the edge. From Phase 6, add a CrowdSec decision:
     `docker compose exec crowdsec cscli decisions add --range <cidr> --duration 4h`.
   - Force a password reset or log out affected users in Keycloak (_Users → Sessions → Sign out_).
5. From Phase 4, the AI Cybersecurity pillar scores these patterns automatically and feeds a risk score
   back to Keycloak for step-up MFA.
