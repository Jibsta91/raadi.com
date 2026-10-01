import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths as IdentityPaths } from './generated/identity';

export type { IdentityPaths };
export type Me = components['schemas']['Me'];
export type Session = components['schemas']['Session'];
export type SessionUser = components['schemas']['SessionUser'];
export type UpdateMe = components['schemas']['UpdateMe'];
export type Locale = components['schemas']['Locale'];
export type Problem = components['schemas']['Problem'];

/**
 * Identity API client. Web (server side) and mobile both use it:
 *   - browsers/SSR: baseUrl = the gateway or identity-bff, auth via session/bearer
 *   - mobile:       baseUrl = public API origin, auth via bearer token
 */
export function createIdentityClient(options: ClientOptions) {
  return createClient<IdentityPaths>(options);
}
