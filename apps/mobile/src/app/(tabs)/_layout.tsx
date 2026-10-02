import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApi } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import { useRealtime } from '../../lib/realtime';
import { fonts, radius, space, useTheme } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  search: ['search', 'search-outline'],
  messages: ['chatbubbles', 'chatbubbles-outline'],
  account: ['person-circle', 'person-circle-outline'],
};

/** Floating "glass" pill: the active tab shows its label, the others only their icon. */
function GlassTabBar({ state, descriptors, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, space.md) }]}
    >
      <Glass style={styles.bar} testID="tab-bar">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const label = options?.title ?? route.name;
          const badge = options?.tabBarBadge;
          const [active, inactive] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              role="tab"
              aria-selected={focused}
              aria-label={badge ? `${label}, ${badge}` : label}
              testID={`tab-${route.name}`}
              onPress={onPress}
              style={[
                styles.tab,
                focused && { backgroundColor: theme.ink, paddingHorizontal: space.lg },
              ]}
            >
              <Ionicons
                name={focused ? active : inactive}
                size={22}
                color={focused ? theme.inkText : theme.subtle}
              />
              {focused ? (
                <Text style={[styles.label, { color: theme.inkText }]}>{label}</Text>
              ) : null}
              {badge ? (
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.badgeText, { color: theme.accentText }]}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

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
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
    >
      <Tabs.Screen name="index" options={{ title: m.tabs.home }} />
      <Tabs.Screen name="search" options={{ title: m.tabs.search }} />
      <Tabs.Screen
        name="messages"
        options={{ title: m.tabs.messages, tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tabs.Screen name="account" options={{ title: m.tabs.account }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  bar: {
    width: '100%',
    maxWidth: 420,
    height: 68,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: space.sm,
  },
  tab: {
    minWidth: 48,
    height: 48,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11 },
});
