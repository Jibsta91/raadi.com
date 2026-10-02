import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { ColorValue } from 'react-native';
import { useI18n } from '../../i18n';
import { useApi } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import { useRealtime } from '../../lib/realtime';
import { useTheme } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );

/** Unread messages for the tab badge: loaded on sign-in and after every live message event. */
function useUnread(): number {
  const api = useApi();
  const { status } = useAuth();
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (status !== 'signedIn') return setCount(0);
    api.messaging
      .GET('/api/v1/messaging/unread')
      .then(({ data }) => setCount(data?.count ?? 0))
      .catch(() => undefined);
  }, [api, status]);
  useEffect(load, [load]);
  useRealtime((event) => event.type !== 'hello' && load());
  return count;
}

export default function TabsLayout() {
  const { m } = useI18n();
  const theme = useTheme();
  const unread = useUnread();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Raadi', tabBarLabel: m.tabs.home, tabBarIcon: icon('home-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: m.tabs.search, tabBarIcon: icon('search-outline') }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: m.tabs.messages,
          tabBarIcon: icon('chatbubbles-outline'),
          tabBarBadge: unread > 0 ? unread : undefined,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: m.tabs.account, tabBarIcon: icon('person-circle-outline') }}
      />
    </Tabs>
  );
}
