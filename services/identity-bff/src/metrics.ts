import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('identity-bff');

/** raadi_auth_login_total{outcome} — feeds the security dashboard and the ATO detector. */
export const loginCounter = meter.createCounter('raadi.auth.login', {
  description: 'OIDC login attempts completed at the callback, by outcome',
});

/** raadi_auth_token_refresh_total{outcome} */
export const refreshCounter = meter.createCounter('raadi.auth.token_refresh', {
  description: 'Access token refreshes performed on behalf of browser sessions',
});
