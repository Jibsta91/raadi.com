import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { useApi } from '../lib/api';
import { useAuth } from '../lib/auth/context';
import { fonts, radius, space, useTheme } from '../theme';
import { Button, Chip, Field } from './ui';

const REASONS = ['fraud', 'prohibited', 'offensive', 'wrong_category', 'other'] as const;

/** "Report listing": a reason and an optional comment, straight to the moderators (ADR-0027). */
export function ReportListing({ listingId }: { listingId: string }) {
  const { m } = useI18n();
  const api = useApi();
  const auth = useAuth();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>();
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (state === 'sent') {
    return (
      <Text testID="report-sent" style={[styles.link, { color: theme.muted }]}>
        {m.report.thanks}
      </Text>
    );
  }
  if (!open) {
    return (
      <Pressable
        role="button"
        testID="report-open"
        onPress={() => (auth.status === 'signedIn' ? setOpen(true) : void auth.signIn())}
      >
        <Text style={[styles.link, { color: theme.muted }]}>{m.report.open}</Text>
      </Pressable>
    );
  }
  const send = async () => {
    if (!reason) return;
    setState('sending');
    const { response } = await api.listings
      .POST('/api/v1/listings/{id}/reports', {
        params: { path: { id: listingId } },
        body: { reason, comment },
      })
      .catch(() => ({ response: { ok: false } }));
    setState(response.ok ? 'sent' : 'error');
  };
  return (
    <View
      testID="report-form"
      style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text style={[styles.title, { color: theme.text }]}>{m.report.title}</Text>
      <View style={styles.reasons}>
        {REASONS.map((r) => (
          <Chip
            key={r}
            testID={`report-reason-${r}`}
            label={m.report.reasons[r]}
            selected={reason === r}
            onPress={() => setReason(r)}
          />
        ))}
      </View>
      <Field
        testID="report-comment"
        value={comment}
        onChangeText={setComment}
        maxLength={500}
        multiline
        placeholder={m.report.comment}
        accessibilityLabel={m.report.comment}
      />
      {state === 'error' ? (
        <Text role="alert" style={{ color: theme.danger }}>
          {m.report.error}
        </Text>
      ) : null}
      <Button
        testID="report-send"
        label={m.report.send}
        disabled={!reason || state === 'sending'}
        onPress={() => void send()}
      />
      <Button variant="secondary" label={m.report.cancel} onPress={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.medium, fontSize: 14, textDecorationLine: 'underline' },
  form: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
