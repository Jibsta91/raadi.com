import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from '../i18n';
import { AuthProvider } from '../lib/auth/provider';
import { RealtimeProvider } from '../lib/realtime';
import { fonts, ThemeProvider, useTheme } from '../theme';

// Deep links (a shared listing, a chat from a notification) open on top of the tabs, so Back works.
export const unstable_settings = { initialRouteName: '(tabs)' };

function Screens() {
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text, fontFamily: fonts.semibold },
          headerBackTitle: m.common.back,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listings/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[id]" options={{ title: m.messages.title }} />
        <Stack.Screen name="my-listings" options={{ title: m.account.myListings }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Fonts ship inside the app (OFL-1.1): nothing is fetched at runtime (ADR-0009).
  const [loaded] = useFonts({
    [fonts.body]: Geist_400Regular,
    [fonts.medium]: Geist_500Medium,
    [fonts.semibold]: Geist_600SemiBold,
    [fonts.bold]: Geist_700Bold,
    [fonts.display]: BricolageGrotesque_700Bold,
    [fonts.displayHeavy]: BricolageGrotesque_800ExtraBold,
  });
  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <RealtimeProvider>
              <Screens />
            </RealtimeProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
