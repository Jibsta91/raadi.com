import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from '../i18n';
import { AuthProvider } from '../lib/auth/provider';
import { RealtimeProvider } from '../lib/realtime';
import { useTheme } from '../theme';

function Screens() {
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.accent,
        headerTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.background },
        headerBackTitle: m.common.back,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="listings/[id]" options={{ title: '' }} />
      <Stack.Screen name="messages/[id]" options={{ title: m.messages.title }} />
      <Stack.Screen name="my-listings" options={{ title: m.account.myListings }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <RealtimeProvider>
            <StatusBar style="auto" />
            <Screens />
          </RealtimeProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
