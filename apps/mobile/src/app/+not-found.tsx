import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Body, Button, LargeTitle } from '../components/ui';
import { useI18n } from '../i18n';
import { space, useTheme } from '../theme';

export default function NotFound() {
  const { m } = useI18n();
  const theme = useTheme();
  const router = useRouter();
  return (
    <View testID="not-found" style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LargeTitle>{m.notFound.title}</LargeTitle>
      <Body muted>{m.notFound.body}</Body>
      <Button label={m.notFound.home} variant="ink" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: space.lg, padding: space.xl },
});
