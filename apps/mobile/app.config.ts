import type { ExpoConfig } from 'expo/config';

// Native builds talk to the gateway and Keycloak directly (OIDC + PKCE, ADR-0021). The web build is
// served by the gateway under /m and uses the website's session instead, so it needs no URLs.
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'http://raadi.localhost';
const authBaseUrl = process.env.AUTH_BASE_URL ?? 'http://auth.raadi.localhost';

const config: ExpoConfig = {
  name: 'Raadi',
  slug: 'raadi',
  version: '0.1.0',
  scheme: 'raadi',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'no.raadi.app', supportsTablet: true },
  android: { package: 'no.raadi.app' },
  web: { bundler: 'metro', output: 'single' },
  plugins: ['expo-router', 'expo-secure-store', 'expo-localization', 'expo-web-browser'],
  experiments: {
    // Only the web export lives under a sub-path; Expo Go serves the app from the dev server's root.
    ...(process.env.MOBILE_WEB_BASE_URL ? { baseUrl: process.env.MOBILE_WEB_BASE_URL } : {}),
  },
  extra: {
    publicBaseUrl,
    authBaseUrl,
    realm: process.env.KEYCLOAK_REALM ?? 'raadi',
    clientId: 'raadi-mobile',
  },
};

export default config;
