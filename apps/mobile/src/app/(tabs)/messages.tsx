import type { Conversation } from '@raadi/api-client';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Status } from '../../components/ui';
import { useI18n } from '../../i18n';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import { config } from '../../lib/config';
import { formatAge } from '../../lib/format';
import { useRealtime } from '../../lib/realtime';
import { absoluteUrl } from '../../lib/urls';
import { space, useTheme } from '../../theme';

function Row({ conversation }: { conversation: Conversation }) {
  const { locale } = useI18n();
  const theme = useTheme();
  const unread = conversation.unread > 0;
  return (
    <Link href={`/messages/${conversation.id}`} asChild>
      {/* Link asChild merges props by spreading: a style array would reach the DOM as {0: …}. */}
      <Pressable testID="conversation" style={{ ...styles.row, borderColor: theme.border }}>
        {conversation.listing.image ? (
          <Image
            source={{ uri: absoluteUrl(conversation.listing.image.thumb, config.apiBaseUrl) }}
            // expo-image hands styles to the DOM on the web: pass one object, not an array.
            style={{ ...styles.thumb, backgroundColor: theme.surface }}
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: theme.surface }]} />
        )}
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {conversation.listing.title}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.muted }}>
            {conversation.counterpart.name}
            {conversation.lastMessage
              ? ` · ${formatAge(conversation.lastMessage.sentAt, locale)}`
              : ''}
          </Text>
          {conversation.lastMessage ? (
            <Text
              numberOfLines={1}
              style={{ color: theme.text, fontWeight: unread ? '700' : '400' }}
            >
              {conversation.lastMessage.body}
            </Text>
          ) : null}
        </View>
        {unread ? (
          <View testID="unread" style={[styles.dot, { backgroundColor: theme.accent }]}>
            <Text style={[styles.dotText, { color: theme.accentText }]}>{conversation.unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

function Inbox() {
  const { m } = useI18n();
  const api = useApi();
  const inbox = useLoad(
    async () => unwrap(await api.messaging.GET('/api/v1/messaging/conversations', {})),
    [api],
  );
  useRealtime((event) => event.type !== 'hello' && inbox.reload());

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={inbox.data?.items ?? []}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <Row conversation={item} />}
      onRefresh={inbox.reload}
      refreshing={false}
      ListEmptyComponent={
        <Status
          loading={inbox.loading && !inbox.data}
          error={inbox.error}
          empty={m.messages.empty}
          onRetry={inbox.reload}
        />
      }
    />
  );
}

export default function Messages() {
  const { m } = useI18n();
  const auth = useAuth();
  if (auth.status === 'loading') return <Status loading />;
  if (auth.status === 'signedOut') {
    return (
      <View style={styles.signedOut}>
        <Text style={{ textAlign: 'center' }}>{m.messages.login}</Text>
        <Button testID="login" label={m.auth.login} onPress={() => void auth.signIn()} />
      </View>
    );
  }
  return <Inbox />;
}

const styles = StyleSheet.create({
  list: { padding: space.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  dot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  dotText: { fontSize: 12, fontWeight: '700' },
  signedOut: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg },
});
