// Push notifications on devices (ADR-0025): register this installation's Expo push token while
// signed in, remove it on sign-out, and open the screen a push points to when it is tapped.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApi } from './api';
import { useAuth } from './auth/context';
import { config } from './config';
import { safeAppPath } from './push-path';

// Show pushes as banners while the app is open too (a new message in another conversation).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Responses already acted on: the "last response" survives reloads and must open only once. */
const handled = new Set<string>();

function open(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const path = safeAppPath(response.notification.request.content.data?.url);
  // After the current render: the navigator must be mounted before we navigate.
  if (path) setTimeout(() => router.push(path as never), 0);
}

/** This installation's Expo push token, asking for permission once; null if not allowed or unavailable. */
async function pushToken(projectId: string): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Raadiso',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status !== 'granted' && current.canAskAgain
      ? (await Notifications.requestPermissionsAsync()).status
      : current.status;
  if (status !== 'granted') return null;
  // Throws in simulators and in Expo Go on Android (no remote push there): no push then.
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

export function PushRegistration(): null {
  const auth = useAuth();
  const api = useApi();
  const registered = useRef<string | null>(null);
  const { status, beforeSignOut } = auth;

  // Taps: the push that started the app, and those tapped while it runs.
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(open, () => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  // Register on every start while signed in (tokens can change; the server moves them between users).
  useEffect(() => {
    const projectId = config.easProjectId;
    if (status !== 'signedIn' || !projectId) return;
    let cancelled = false;
    (async () => {
      const token = await pushToken(projectId);
      if (!token || cancelled) return;
      const { response } = await api.notifications.PUT('/api/v1/notifications/devices', {
        body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
      });
      if (response.ok) registered.current = token;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, api]);

  // Sign-out: stop pushing to this device while the session still works.
  useEffect(
    () =>
      beforeSignOut(async () => {
        const token = registered.current;
        if (!token) return;
        registered.current = null;
        await api.notifications.DELETE('/api/v1/notifications/devices/{token}', {
          params: { path: { token } },
        });
      }),
    [beforeSignOut, api],
  );

  return null;
}
