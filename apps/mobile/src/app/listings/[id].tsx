import Ionicons from '@expo/vector-icons/Ionicons';
import { COUNTIES, type County } from '@raadi/catalog/places';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoPhoto } from '../../components/no-photo';
import { Badge, Body, Button, Field, Glass, Status } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { Messages } from '../../i18n/messages';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { useAuth } from '../../lib/auth/context';
import { config } from '../../lib/config';
import { formatAge, formatPrice } from '../../lib/format';
import { absoluteUrl } from '../../lib/urls';
import { fonts, radius, space, useTheme } from '../../theme';

type ErrorKey = keyof Messages['messages']['errors'];

function problemCode(body: unknown): ErrorKey {
  const code = (body as { errors?: { code?: string }[] } | undefined)?.errors?.[0]?.code;
  return code === 'own_listing' || code === 'listing_unavailable' || code === 'rate_limited'
    ? code
    : 'generic';
}

/** Round glass button over the photo. */
function GlassIcon({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} hitSlop={6}>
      <Glass style={styles.iconButton}>
        <Ionicons name={icon} size={20} color={theme.text} />
      </Glass>
    </Pressable>
  );
}

function Compose({ listingId, onCancel }: { listingId: string; onCancel: () => void }) {
  const { m } = useI18n();
  const api = useApi();
  const theme = useTheme();
  const [body, setBody] = useState(m.contact.defaultText);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorKey>();

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
    <View style={styles.compose}>
      <Field
        testID="contact-body"
        value={body}
        onChangeText={setBody}
        placeholder={m.contact.placeholder}
        accessibilityLabel={m.contact.placeholder}
        multiline
        maxLength={2000}
        autoFocus
      />
      {error ? <Body style={{ color: theme.danger }}>{m.messages.errors[error]}</Body> : null}
      <View style={styles.composeActions}>
        <View style={styles.grow}>
          <Button
            testID="contact-send"
            label={sending ? m.messages.sending : m.contact.send}
            disabled={sending || body.trim().length === 0}
            onPress={() => void send()}
          />
        </View>
        <Button variant="secondary" label={m.common.back} onPress={onCancel} />
      </View>
    </View>
  );
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { m, locale } = useI18n();
  const api = useApi();
  const auth = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const [composing, setComposing] = useState(false);
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

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (listing.loading || listing.error) {
    return <Status loading={listing.loading} error={listing.error} onRetry={listing.reload} />;
  }
  const item = listing.data;
  if (!item || item.status === 'deleted') {
    return (
      <View style={[styles.missing, { paddingTop: insets.top + space.lg }]}>
        <GlassIcon icon="chevron-back" label={m.common.back} onPress={back} />
        <Status empty={m.listing.notFound} testID="not-found" />
      </View>
    );
  }

  const pageWidth = Math.min(width, 720);
  const photoHeight = Math.round(pageWidth * 0.95);
  const promoted = item.promotedUntil !== null && new Date(item.promotedUntil) > new Date();
  const canContact = !item.viewer?.isOwner && item.status === 'active';
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPhoto(Math.round(e.nativeEvent.contentOffset.x / pageWidth));

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView testID="listing" contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        <View style={{ height: photoHeight, backgroundColor: theme.placeholder }}>
          {item.images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScroll}
              onScroll={onScroll}
              scrollEventThrottle={64}
            >
              {item.images.map((image) => (
                <Image
                  key={image.id}
                  source={{ uri: absoluteUrl(image.urls.large, config.apiBaseUrl) }}
                  style={{ width: pageWidth, height: photoHeight }}
                  contentFit="cover"
                  transition={150}
                />
              ))}
            </ScrollView>
          ) : (
            <NoPhoto category={item.category} size={64} style={{ flex: 1 }} />
          )}
          {item.images.length > 1 ? (
            <Glass style={styles.counter}>
              <Text style={[styles.counterText, { color: theme.text }]}>
                {photo + 1} / {item.images.length}
              </Text>
            </Glass>
          ) : null}
        </View>

        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.badges}>
            {item.status === 'sold' ? (
              <Badge label={m.listing.sold} tone="neutral" testID="sold" />
            ) : null}
            {promoted ? <Badge label={m.listing.promoted} testID="promoted" /> : null}
          </View>
          <Text
            role="heading"
            aria-level={1}
            testID="listing-title"
            style={[styles.title, { color: theme.text }]}
          >
            {item.title}
          </Text>
          <Text testID="listing-price" style={[styles.price, { color: theme.text }]}>
            {formatPrice(item.priceNok, locale, m.common.noPrice)}
          </Text>
          <View style={styles.place}>
            <Ionicons name="location-outline" size={16} color={theme.muted} />
            <Body muted style={styles.small}>
              {item.location.name},{' '}
              {COUNTIES[item.location.county as County] ?? item.location.county} ·{' '}
              {formatAge(item.publishedAt, locale)}
            </Body>
          </View>

          <View
            testID="seller"
            style={[styles.seller, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={[styles.avatar, { backgroundColor: theme.placeholder }]}>
              <Text style={[styles.avatarText, { color: theme.text }]}>
                {(seller.data?.name ?? item.seller.name).slice(0, 1)}
              </Text>
            </View>
            <View style={styles.grow}>
              <Text style={[styles.sellerName, { color: theme.text }]}>
                {seller.data?.name ?? item.seller.name}
              </Text>
              {seller.data ? (
                <View style={styles.place}>
                  <Ionicons
                    name={seller.data.verification ? 'shield-checkmark' : 'shield-outline'}
                    size={14}
                    color={seller.data.verification ? theme.accent : theme.muted}
                  />
                  <Body muted style={styles.small}>
                    {seller.data.verification ? m.listing.verified : m.listing.notVerified}
                    {seller.data.rating.average !== null
                      ? ` · ★ ${seller.data.rating.average.toFixed(1)} (${seller.data.rating.count})`
                      : ''}
                  </Body>
                </View>
              ) : null}
            </View>
          </View>

          <Body>{item.description}</Body>
          {item.viewer?.isOwner ? (
            <Badge label={m.listing.yours} tone="neutral" testID="own-listing" />
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + space.sm }]} pointerEvents="box-none">
        <GlassIcon icon="chevron-back" label={m.common.back} onPress={back} />
        <GlassIcon
          icon="share-outline"
          label={m.common.share}
          onPress={() => {
            // Share the website's page: it opens for anyone, app or not.
            const origin = config.apiBaseUrl || window.location.origin;
            void Share.share({
              message: `${item.title} — ${origin}/${locale}/listings/${item.id}`,
            });
          }}
        />
      </View>

      {canContact ? (
        <Glass style={[styles.bottomBar, { bottom: Math.max(insets.bottom, space.md) }]}>
          {composing && auth.status === 'signedIn' ? (
            <Compose listingId={item.id} onCancel={() => setComposing(false)} />
          ) : (
            <Button
              testID={auth.status === 'signedIn' ? 'contact-open' : 'contact-login'}
              label={auth.status === 'signedIn' ? m.contact.title : m.contact.login}
              icon={
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.accentText} />
              }
              onPress={() => (auth.status === 'signedIn' ? setComposing(true) : void auth.signIn())}
            />
          )}
        </Glass>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  missing: { flex: 1, paddingHorizontal: space.lg },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  counter: {
    position: 'absolute',
    bottom: 44,
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: { fontFamily: fonts.semibold, fontSize: 12 },
  sheet: {
    marginTop: -radius.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl - 4,
    paddingTop: space.xl,
    gap: space.md,
  },
  badges: { flexDirection: 'row', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  price: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  small: { fontSize: 14, lineHeight: 20 },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md + 2,
    borderRadius: radius.lg - 2,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 18 },
  sellerName: { fontFamily: fonts.semibold, fontSize: 16 },
  grow: { flex: 1 },
  bottomBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    borderRadius: radius.xl - 2,
    padding: space.sm + 2,
  },
  compose: { gap: space.sm + 2 },
  composeActions: { flexDirection: 'row', gap: space.sm },
});
