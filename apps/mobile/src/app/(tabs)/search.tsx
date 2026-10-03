import Ionicons from '@expo/vector-icons/Ionicons';
import type { SearchHit } from '@raadi/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListingTile } from '../../components/listing-card';
import { Body, Chip, Field, LargeTitle, Status } from '../../components/ui';
import { fill, useI18n } from '../../i18n';
import { unwrap, useApi } from '../../lib/api';
import { CATEGORIES, isCategory } from '../../lib/categories';
import { space, tabBarSpace, useTheme } from '../../theme';

const PAGE_SIZE = 24;

export default function Search() {
  const { m } = useI18n();
  const api = useApi();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const query = params.q ?? '';
  const category = isCategory(params.category) ? params.category : undefined;
  const [text, setText] = useState(query);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => setText(query), [query]);

  // A new query or category starts again at page 1.
  useEffect(() => {
    setHits([]);
    setTotal(undefined);
    setPage(1);
  }, [query, category, nonce]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.search
      .GET('/api/v1/search/listings', {
        params: { query: { q: query || undefined, category, page, pageSize: PAGE_SIZE } },
      })
      .then((res) => {
        const result = unwrap(res);
        if (cancelled || !result) return;
        setTotal(result.total);
        setHits((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api, query, category, page, nonce]);

  const more = () => {
    if (!loading && total !== undefined && hits.length < total) setPage((p) => p + 1);
  };

  return (
    <FlatList
      testID="search-results"
      contentContainerStyle={[
        styles.list,
        { paddingTop: insets.top + space.lg, paddingBottom: tabBarSpace + insets.bottom },
      ]}
      data={hits}
      numColumns={2}
      columnWrapperStyle={styles.row}
      keyExtractor={(hit) => hit.id}
      renderItem={({ item }) => <ListingTile hit={item} />}
      onEndReached={more}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <LargeTitle>{m.tabs.search}</LargeTitle>
          <Field
            testID="search-input"
            value={text}
            onChangeText={setText}
            placeholder={m.search.placeholder}
            accessibilityLabel={m.search.placeholder}
            returnKeyType="search"
            onSubmitEditing={() => router.setParams({ q: text.trim() })}
            icon={<Ionicons name="search" size={20} color={theme.muted} />}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.bleed}
          >
            <Chip
              label={m.home.all}
              selected={!category}
              onPress={() => router.setParams({ category: '' })}
            />
            {CATEGORIES.map((id) => (
              <Chip
                key={id}
                testID={`filter-${id}`}
                label={m.categories[id]}
                selected={category === id}
                onPress={() => router.setParams({ category: id })}
              />
            ))}
          </ScrollView>
          {total !== undefined ? (
            <Body muted testID="search-total">
              {fill(m.search.results, { count: total })}
            </Body>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Status
          loading={loading}
          error={error}
          empty={m.search.noResults}
          onRetry={() => setNonce((n) => n + 1)}
        />
      }
      ListFooterComponent={hits.length > 0 && loading ? <Status loading /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl - 4, flexGrow: 1 },
  row: { gap: space.md + 2, marginBottom: space.lg },
  header: { gap: space.lg, marginBottom: space.md },
  bleed: { marginHorizontal: -(space.xl - 4) },
  chips: { gap: space.sm, paddingHorizontal: space.xl - 4 },
});
