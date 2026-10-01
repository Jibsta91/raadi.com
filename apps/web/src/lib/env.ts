/** Runtime configuration (read per request, never baked into the image). */
export const env = {
  get identityBffUrl() {
    return process.env.IDENTITY_BFF_URL ?? 'http://identity-bff:4000';
  },
  get listingsUrl() {
    return process.env.LISTINGS_URL ?? 'http://listings:4000';
  },
  get searchUrl() {
    return process.env.SEARCH_URL ?? 'http://search:4000';
  },
  get publicBaseUrl() {
    return process.env.PUBLIC_BASE_URL ?? 'http://raadi.localhost';
  },
  get authBaseUrl() {
    return process.env.AUTH_BASE_URL ?? 'http://auth.raadi.localhost';
  },
  get realm() {
    return process.env.KEYCLOAK_REALM ?? 'raadi';
  },
  get sessionCookie() {
    return process.env.SESSION_COOKIE_NAME ?? 'raadi_sid';
  },
};
