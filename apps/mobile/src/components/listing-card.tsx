import type { SearchHit } from '@raadi/api-client';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { config } from '../lib/config';
import { formatPrice } from '../lib/format';
import { absoluteUrl } from '../lib/urls';
import { space, useTheme } from '../theme';
import { Badge } from './ui';

export function ListingCard({ hit }: { hit: SearchHit }) {
  const { m, locale } = useI18n();
  const theme = useTheme();
  return (
    <Link href={`/listings/${hit.id}`} asChild>
      {/* Link asChild merges props by spreading: a style array would reach the DOM as {0: …}. */}
      <Pressable testID="listing-card" style={{ ...styles.card, borderColor: theme.border }}>
        {hit.image ? (
          <Image
            source={{ uri: absoluteUrl(hit.image.card, config.apiBaseUrl) }}
            // expo-image hands styles to the DOM on the web: pass one object, not an array.
            style={{ ...styles.image, backgroundColor: theme.surface }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.image, { backgroundColor: theme.surface }]} />
        )}
        <View style={styles.text}>
          {hit.promoted ? <Badge label={m.listing.promoted} testID="promoted" /> : null}
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {hit.title}
          </Text>
          <Text style={[styles.price, { color: theme.text }]}>
            {formatPrice(hit.priceNok, locale, m.common.noPrice)}
          </Text>
          <Text style={[styles.place, { color: theme.muted }]}>{hit.location.name}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1 },
  image: { width: 112, height: 84, borderRadius: 8 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 15, fontWeight: '700' },
  place: { fontSize: 13 },
});
