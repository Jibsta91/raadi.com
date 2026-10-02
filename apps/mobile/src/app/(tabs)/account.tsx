import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Body, Button, Status, Title } from '../../components/ui';
import { fill, useI18n } from '../../i18n';
import { languageNames } from '../../i18n/messages';
import { useAuth } from '../../lib/auth/context';
import type { Locale } from '../../lib/format';
import { space } from '../../theme';

const LOCALES: Locale[] = ['nb', 'en', 'so'];

export default function Account() {
  const { m, locale, setLocale } = useI18n();
  const auth = useAuth();
  if (auth.status === 'loading') return <Status loading />;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Title>{m.account.title}</Title>
      {auth.status === 'signedIn' && auth.user ? (
        <View style={styles.section}>
          <Body testID="signed-in-as">
            {fill(m.auth.signedInAs, { email: auth.user.email ?? auth.user.name ?? '' })}
          </Body>
          <Button
            testID="my-listings"
            variant="secondary"
            label={m.account.myListings}
            onPress={() => router.push('/my-listings')}
          />
          <Button
            testID="logout"
            variant="secondary"
            label={m.auth.logout}
            onPress={() => void auth.signOut()}
          />
        </View>
      ) : (
        <View style={styles.section}>
          {auth.error ? <Body muted>{m.auth.failed}</Body> : null}
          <Button testID="login" label={m.auth.login} onPress={() => void auth.signIn()} />
        </View>
      )}

      <View style={styles.section}>
        <Title>{m.account.language}</Title>
        <View style={styles.languages}>
          {LOCALES.map((l) => (
            <Button
              key={l}
              testID={`locale-${l}`}
              label={languageNames[l]}
              variant={l === locale ? 'primary' : 'secondary'}
              onPress={() => setLocale(l)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.xl },
  section: { gap: space.md },
  languages: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
