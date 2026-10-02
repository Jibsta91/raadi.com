// Small, non-secret preferences on the device. SecureStore is already a dependency (for the refresh
// token) and keeps the app free of another storage module.
import * as SecureStore from 'expo-secure-store';

export async function getPreference(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key).catch(() => null);
}

export async function setPreference(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value).catch(() => undefined);
}
