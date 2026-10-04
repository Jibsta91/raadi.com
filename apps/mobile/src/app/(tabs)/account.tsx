import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, LargeTitle, Status, Title } from '../../components/ui';
import { fill, useI18n } from '../../i18n';
import { languageNames } from '../../i18n/messages';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import type { Locale } from '../../lib/format';
import {
  fonts,
  radius,
  space,
  tabBarSpace,
  useTheme,
  useThemeState,
  type ThemePreference,
} from '../../theme';

const LOCALES: Locale[] = ['nb', 'en', 'so'];
const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

/** iOS-style segmented control. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      testID={testID}
      style={[styles.segmented, { backgroundColor: theme.surfaceAlt }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            testID={`${testID}-${option.value}`}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && [
                styles.selected,
                { backgroundColor: theme.surface, shadowColor: theme.shadow },
              ],
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selected ? theme.text : theme.muted },
                selected && { fontFamily: fonts.semibold },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Push for new messages (ADR-0025). Other pushes follow the in-app notices and cannot be muted. */
function NotificationSettings() {
  const { m } = useI18n();
  const api = useApi();
  const theme = useTheme();
  const prefs = useLoad(
    async () => unwrap(await api.notifications.GET('/api/v1/notifications/preferences')),
    [api],
  );
  const [saving, setSaving] = useState(false);
  const [override, setOverride] = useState<boolean>();
  const value = override ?? prefs.data?.pushMessages ?? true;

  const toggle = async (next: boolean) => {
    if (!prefs.data) return;
    setOverride(next);
    setSaving(true);
    const { response } = await api.notifications
      .PUT('/api/v1/notifications/preferences', {
        body: { emailMessages: prefs.data.emailMessages, pushMessages: next },
      })
      .catch(() => ({ response: { ok: false } }));
    if (!response.ok) setOverride(!next);
    setSaving(false);
  };

  return (
    <View style={styles.section}>
      <Title>{m.account.notifications}</Title>
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowText, { color: theme.text }]}>{m.account.pushMessages}</Text>
        <Switch
          testID="push-messages"
          accessibilityLabel={m.account.pushMessages}
          value={value}
          disabled={!prefs.data || saving}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ true: theme.accent }}
        />
      </View>
      <Body muted style={styles.hint}>
        {m.account.pushHint}
      </Body>
    </View>
  );
}

export default function Account() {
  const { m, locale, setLocale } = useI18n();
  const { preference, setPreference } = useThemeState();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  if (auth.status === 'loading') return <Status loading />;

  const themeLabels: Record<ThemePreference, string> = {
    system: m.account.themeSystem,
    light: m.account.themeLight,
    dark: m.account.themeDark,
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.lg, paddingBottom: tabBarSpace + insets.bottom },
      ]}
    >
      <LargeTitle>{m.account.title}</LargeTitle>
      {auth.status === 'signedIn' && auth.user ? (
        <View style={styles.section}>
          <Body testID="signed-in-as">
            {fill(m.auth.signedInAs, { email: auth.user.email ?? auth.user.name ?? '' })}
          </Body>
          <Button
            testID="account-new-listing"
            variant="ink"
            label={m.sell.title}
            onPress={() => router.push('/listings/new')}
          />
          <Button
            testID="my-listings"
            variant="secondary"
            label={m.account.myListings}
            onPress={() => router.push('/my-listings')}
          />
          <Button
            testID="favourites"
            variant="secondary"
            label={m.favourites.title}
            onPress={() => router.push('/favourites')}
          />
          <Button
            testID="saved-searches"
            variant="secondary"
            label={m.savedSearches.title}
            onPress={() => router.push('/saved-searches')}
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

      {auth.status === 'signedIn' && Platform.OS !== 'web' ? <NotificationSettings /> : null}

      <View style={styles.section}>
        <Title>{m.account.appearance}</Title>
        <Segmented
          testID="theme"
          label={m.account.appearance}
          value={preference}
          onChange={setPreference}
          options={THEMES.map((t) => ({ value: t, label: themeLabels[t] }))}
        />
      </View>

      <View style={styles.section}>
        <Title>{m.account.language}</Title>
        <Segmented
          testID="locale"
          label={m.account.language}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l, label: languageNames[l] }))}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl - 4, gap: space.xxl },
  section: { gap: space.md },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: radius.md, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
  segmentText: { fontFamily: fonts.medium, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: 16 },
  hint: { fontSize: 14, lineHeight: 20 },
});
