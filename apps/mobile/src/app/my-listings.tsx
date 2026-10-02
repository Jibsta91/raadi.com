import type { Listing } from '@raadi/api-client';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Status } from '../components/ui';
import { NoPhoto } from '../components/no-photo';
import { useI18n } from '../i18n';
import { unwrap, useApi, useLoad } from '../lib/api';
import { useAuth } from '../lib/auth/context';
import { config } from '../lib/config';
import { formatPrice } from '../lib/format';
import { absoluteUrl } from '../lib/urls';
import { fonts, radius, space, useTheme } from '../theme';

function Row({ listing }: { listing: Listing }) {
  const { m, locale } = useI18n();
  const theme = useTheme();
  const image = listing.images[0];
  return (
    <Link href={`/listings/${listing.id}`} asChild>
      {/* Link asChild merges props by spreading: a style array would reach the DOM as {0: …}. */}
      <Pressable
        testID="my-listing"
        style={{ ...styles.row, backgroundColor: theme.surface, borderColor: theme.border }}
      >
        {image ? (
          <Image
            source={{ uri: absoluteUrl(image.urls.thumb, config.apiBaseUrl) }}
            // expo-image hands styles to the DOM on the web: pass one object, not an array.
            style={{ ...styles.thumb, backgroundColor: theme.placeholder }}
          />
        ) : (
          <NoPhoto category={listing.category} size={24} style={styles.thumb} />
        )}
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {listing.title}
          </Text>
          <Text style={[styles.price, { color: theme.muted }]}>
            {formatPrice(listing.priceNok, locale, m.common.noPrice)}
          </Text>
          {listing.status === 'sold' ? <Badge label={m.listing.sold} tone="neutral" /> : null}
        </View>
      </Pressable>
    </Link>
  );
}

export default function MyListings() {
  const { m } = useI18n();
  const api = useApi();
  const auth = useAuth();
  const mine = useLoad(
    async () =>
      auth.status === 'signedIn'
        ? unwrap(
            await api.listings.GET('/api/v1/listings/mine', { params: { query: { limit: 50 } } }),
          )
        : undefined,
    [api, auth.status],
  );

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={mine.data?.items ?? []}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <Row listing={item} />}
      ListEmptyComponent={
        <Status
          loading={mine.loading}
          error={mine.error}
          empty={m.account.myListingsEmpty}
          onRetry={mine.reload}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm + 2, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg - 2,
    borderWidth: 1,
  },
  thumb: { width: 60, height: 60, borderRadius: radius.md - 4 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  price: { fontFamily: fonts.medium, fontSize: 14, fontVariant: ['tabular-nums'] },
});
