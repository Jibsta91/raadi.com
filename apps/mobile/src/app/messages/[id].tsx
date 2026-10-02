import type { Message } from '@raadi/api-client';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Field, Status } from '../../components/ui';
import { useI18n } from '../../i18n';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { formatAge } from '../../lib/format';
import { useRealtime } from '../../lib/realtime';
import { space, useTheme } from '../../theme';

function Bubble({ message }: { message: Message }) {
  const { locale } = useI18n();
  const theme = useTheme();
  const mine = message.fromMe;
  return (
    <View
      testID={mine ? 'message-mine' : 'message-theirs'}
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: theme.accent }
          : { alignSelf: 'flex-start', backgroundColor: theme.surface },
      ]}
    >
      <Text style={{ color: mine ? theme.accentText : theme.text, fontSize: 16 }}>
        {message.body}
      </Text>
      <Text style={[styles.time, { color: mine ? theme.accentText : theme.muted }]}>
        {formatAge(message.sentAt, locale)}
      </Text>
    </View>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { m } = useI18n();
  const api = useApi();
  const theme = useTheme();
  const list = useRef<FlatList<Message>>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const detail = useLoad(
    async () =>
      unwrap(
        await api.messaging.GET('/api/v1/messaging/conversations/{id}', {
          params: { path: { id } },
        }),
      ),
    [api, id],
  );

  const markRead = useCallback(() => {
    void api.messaging
      .POST('/api/v1/messaging/conversations/{id}/read', { params: { path: { id } } })
      .catch(() => undefined);
  }, [api, id]);

  useEffect(() => {
    if (!detail.data) return;
    setMessages(detail.data.messages);
    setHasMore(detail.data.hasMore);
    markRead();
  }, [detail.data, markRead]);

  const append = useCallback((message: Message) => {
    setMessages((prev) => (prev.some((m2) => m2.id === message.id) ? prev : [...prev, message]));
  }, []);

  useRealtime((event) => {
    if (event.type === 'message' && event.message.conversationId === id) {
      append(event.message);
      if (!event.message.fromMe) markRead();
    }
  });

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    const res = await api.messaging.GET('/api/v1/messaging/conversations/{id}', {
      params: { path: { id }, query: { before: oldest.sentAt } },
    });
    if (!res.data) return;
    const older = res.data.messages;
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    setHasMore(res.data.hasMore);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setSendError(false);
    try {
      const res = await api.messaging.POST('/api/v1/messaging/conversations/{id}/messages', {
        params: { path: { id } },
        body: { body },
      });
      if (res.data) {
        append(res.data);
        setDraft('');
      } else {
        setSendError(true);
      }
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  if (!detail.data) {
    return (
      <Status
        loading={detail.loading}
        error={detail.error}
        empty={m.messages.empty}
        onRetry={detail.reload}
      />
    );
  }
  const conversation = detail.data;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: conversation.counterpart.name }} />
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Body style={styles.listingTitle} testID="conversation-listing">
          {conversation.listing.title}
        </Body>
        <Body muted>
          {conversation.role === 'buyer' ? m.messages.roleBuyer : m.messages.roleSeller}
        </Body>
      </View>
      <FlatList
        ref={list}
        testID="thread"
        contentContainerStyle={styles.thread}
        data={messages}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => <Bubble message={item} />}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          hasMore ? (
            <Button variant="secondary" label={m.messages.older} onPress={() => void loadOlder()} />
          ) : null
        }
      />
      {sendError ? (
        <Body style={{ color: theme.danger, paddingHorizontal: space.lg }}>
          {m.messages.errors.generic}
        </Body>
      ) : null}
      <View style={[styles.composer, { borderColor: theme.border }]}>
        <View style={styles.composerField}>
          <Field
            testID="compose"
            value={draft}
            onChangeText={setDraft}
            placeholder={m.messages.compose}
            accessibilityLabel={m.messages.compose}
            multiline
            maxLength={2000}
          />
        </View>
        <Button
          testID="send"
          label={sending ? m.messages.sending : m.messages.send}
          disabled={sending || draft.trim().length === 0}
          onPress={() => void send()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { padding: space.lg, gap: space.xs, borderBottomWidth: 1 },
  listingTitle: { fontWeight: '600' },
  thread: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: 2,
  },
  time: { fontSize: 11, opacity: 0.8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  composerField: { flex: 1 },
});
