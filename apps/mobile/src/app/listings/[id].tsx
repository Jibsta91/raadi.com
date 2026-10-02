import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Badge, Body, Button, Field, Status, Title } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { Messages } from '../../i18n/messages';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import { config } from '../../lib/config';
import { formatPrice } from '../../lib/format';
import { absoluteUrl } from '../../lib/urls';
import { space, useTheme } from '../../theme';

type ErrorKey = keyof Messages['messages']['errors'];

function problemCode(body: unknown): ErrorKey {
  const code = (body as { errors?: { code?: string }[] } | undefined)?.errors?.[0]?.code;
  return code === 'own_listing' || code === 'listing_unavailable' || code === 'rate_limited'
    ? code
    : 'generic';
}

function Contact({ listingId }: { listingId: string }) {
  const { m } = useI18n();
  const api = useApi();
  const auth = useAuth();
  const theme = useTheme();
  const [body, setBody] = useState(m.contact.defaultText);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorKey>();

  if (auth.status !== 'signedIn') {
    return (
      <Button testID="contact-login" label={m.contact.login} onPress={() => void auth.signIn()} />
    );
  }

  const send = async () => {
    setSending(true);
    setError(undefined);
    try {
      const res = await api.messaging.POST('/api/v1/messaging/conversations', {
        body: { listingId, body: body.trim() },
      });
      if (res.data) {
        router.push(`/messages/${res.data.conversation.id}`);
      } else {
        setError(res.response.status === 429 ? 'rate_limited' : problemCode(res.error));
      }
    } catch {
      setError('generic');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.section}>
      <Title>{m.contact.title}</Title>
      <Field
        testID="contact-body"
        value={body}
        onChangeText={setBody}
        placeholder={m.contact.placeholder}
        accessibilityLabel={m.contact.placeholder}
        multiline
        maxLength={2000}
      />
      {error ? <Body style={{ color: theme.danger }}>{m.messages.errors[error]}</Body> : null}
      <Button
        testID="contact-send"
        label={sending ? m.messages.sending : m.contact.send}
        disabled={sending || body.trim().length === 0}
        onPress={() => void send()}
      />
    </View>
  );
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { m, locale } = useI18n();
  const api = useApi();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const listing = useLoad(
    async () =>
      unwrap(await api.listings.GET('/api/v1/listings/{id}', { params: { path: { id } } })),
    [api, id],
  );
  const seller = useLoad(
    async () =>
      unwrap(
        await api.trust.GET('/api/v1/trust/listings/{id}/seller', { params: { path: { id } } }),
      ),
    [api, id],
  );

  if (listing.loading || listing.error) {
    return <Status loading={listing.loading} error={listing.error} onRetry={listing.reload} />;
  }
  const item = listing.data;
  if (!item || item.status === 'deleted')
    return <Status empty={m.listing.notFound} testID="not-found" />;

  const imageWidth = Math.min(width, 720);
  const promoted = item.promotedUntil !== null && new Date(item.promotedUntil) > new Date();

  return (
    <ScrollView contentContainerStyle={styles.page} testID="listing">
      <Stack.Screen options={{ title: item.title }} />
      {item.images.length > 0 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {item.images.map((image) => (
            <Image
              key={image.id}
              source={{ uri: absoluteUrl(image.urls.large, config.apiBaseUrl) }}
              style={{
                width: imageWidth,
                height: imageWidth * 0.75,
                backgroundColor: theme.surface,
              }}
              contentFit="cover"
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.body}>
        <View style={styles.badges}>
          {item.status === 'sold' ? <Badge label={m.listing.sold} testID="sold" /> : null}
          {promoted ? <Badge label={m.listing.promoted} testID="promoted" /> : null}
        </View>
        <Title testID="listing-title">{item.title}</Title>
        <Body style={styles.price} testID="listing-price">
          {formatPrice(item.priceNok, locale, m.common.noPrice)}
        </Body>
        <Body muted>
          {item.location.name}, {item.location.county}
        </Body>
        <Body>{item.description}</Body>

        <View
          style={[styles.section, styles.seller, { borderColor: theme.border }]}
          testID="seller"
        >
          <Body muted>{m.listing.seller}</Body>
          <Body style={styles.sellerName}>{seller.data?.name ?? item.seller.name}</Body>
          {seller.data ? (
            <Body muted>
              {seller.data.verification ? m.listing.verified : m.listing.notVerified}
              {seller.data.rating.average !== null
                ? ` · ★ ${seller.data.rating.average.toFixed(1)} (${seller.data.rating.count})`
                : ''}
            </Body>
          ) : null}
        </View>

        {item.viewer?.isOwner ? (
          <Badge label={m.listing.yours} testID="own-listing" />
        ) : item.status === 'active' ? (
          <Contact listingId={item.id} />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: space.xl },
  body: { padding: space.lg, gap: space.md },
  badges: { flexDirection: 'row', gap: space.sm },
  price: { fontSize: 20, fontWeight: '700' },
  section: { gap: space.md },
  seller: { borderWidth: 1, borderRadius: 10, padding: space.md, gap: space.xs },
  sellerName: { fontWeight: '600' },
});
