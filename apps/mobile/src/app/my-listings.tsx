import type { Listing } from '@raadi/api-client';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Status } from '../components/ui';
import { useI18n } from '../i18n';
import { unwrap, useApi, useLoad } from '../lib/api';
import { useAuth } from '../lib/auth/context';
import { config } from '../lib/config';
import { formatPrice } from '../lib/format';
import { absoluteUrl } from '../lib/urls';
import { space, useTheme } from '../theme';

function Row({ listing }: { listing: Listing }) {
  const { m, locale } = useI18n();
  const theme = useTheme();
  const image = listing.images[0];
  return (
    <Link href={`/listings/${listing.id}`} asChild>
      {/* Link asChild merges props by spreading: a style array would reach the DOM as {0: …}. */}
      <Pressable testID="my-listing" style={{ ...styles.row, borderColor: theme.border }}>
        {image ? (
          <Image
            source={{ uri: absoluteUrl(image.urls.thumb, config.apiBaseUrl) }}
            // expo-image hands styles to the DOM on the web: pass one object, not an array.
            style={{ ...styles.thumb, backgroundColor: theme.surface }}
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: theme.surface }]} />
        )}
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {listing.title}
          </Text>
          <Text style={{ color: theme.muted }}>
            {formatPrice(listing.priceNok, locale, m.common.noPrice)}
          </Text>
          {listing.status === 'sold' ? <Badge label={m.listing.sold} /> : null}
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
});
