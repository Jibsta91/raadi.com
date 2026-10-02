import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  publicBaseUrl: string;
  authBaseUrl: string;
  realm: string;
  clientId: string;
}

const extra = Constants.expoConfig?.extra as Extra;

export const config = {
  /** Empty on the web: the web build is served by the gateway, so API calls stay same-origin. */
  apiBaseUrl: Platform.OS === 'web' ? '' : extra.publicBaseUrl,
  issuer: `${extra.authBaseUrl}/realms/${extra.realm}`,
  clientId: extra.clientId,
};
