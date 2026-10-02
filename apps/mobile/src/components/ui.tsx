import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useI18n } from '../i18n';
import { space, useTheme } from '../theme';

export function Title({ children, testID }: { children: ReactNode; testID?: string }) {
  const theme = useTheme();
  return (
    <Text role="heading" testID={testID} style={[styles.title, { color: theme.text }]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
  testID,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: TextStyle;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Text testID={testID} style={[styles.body, { color: muted ? theme.muted : theme.text }, style]}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      role="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : 'transparent',
          borderColor: theme.accent,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? theme.accentText : theme.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      {...props}
      style={[
        styles.field,
        { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
        props.style,
      ]}
    />
  );
}

/** Loading, error (with retry) and empty states share one centred layout. */
export function Status({
  loading,
  error,
  empty,
  onRetry,
  testID,
}: {
  loading?: boolean;
  error?: boolean;
  empty?: string;
  onRetry?: () => void;
  testID?: string;
}) {
  const { m } = useI18n();
  const theme = useTheme();
  if (loading) {
    return (
      <View style={styles.centred} testID={testID ?? 'loading'}>
        <ActivityIndicator color={theme.accent} accessibilityLabel={m.common.loading} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centred} testID={testID ?? 'error'}>
        <Body muted>{m.common.error}</Body>
        {onRetry ? <Button variant="secondary" label={m.common.retry} onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.centred} testID={testID ?? 'empty'}>
        <Body muted>{empty}</Body>
      </View>
    );
  }
  return null;
}

export function Badge({ label, testID }: { label: string; testID?: string }) {
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: theme.badge }]}>
      <Text style={[styles.badgeText, { color: theme.badgeText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', marginBottom: space.sm },
  body: { fontSize: 16, lineHeight: 22 },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  field: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
