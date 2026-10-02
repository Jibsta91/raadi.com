import type { SearchHit } from '@raadi/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ListingCard } from '../../components/listing-card';
import { Body, Field, Status } from '../../components/ui';
import { fill, useI18n } from '../../i18n';
import { unwrap, useApi } from '../../lib/api';
import { space } from '../../theme';

const PAGE_SIZE = 24;

export default function Search() {
  const { m } = useI18n();
  const api = useApi();
  const params = useLocalSearchParams<{ q?: string }>();
  const query = params.q ?? '';
  const [text, setText] = useState(query);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => setText(query), [query]);

  // A new query starts again at page 1.
  useEffect(() => {
    setHits([]);
    setTotal(undefined);
    setPage(1);
  }, [query, nonce]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.search
      .GET('/api/v1/search/listings', {
        params: { query: { q: query || undefined, page, pageSize: PAGE_SIZE } },
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
  }, [api, query, page, nonce]);

  const more = () => {
    if (!loading && total !== undefined && hits.length < total) setPage((p) => p + 1);
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={hits}
      keyExtractor={(hit) => hit.id}
      renderItem={({ item }) => <ListingCard hit={item} />}
      onEndReached={more}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <Field
            testID="search-input"
            value={text}
            onChangeText={setText}
            placeholder={m.search.placeholder}
            accessibilityLabel={m.search.placeholder}
            returnKeyType="search"
            onSubmitEditing={() => router.setParams({ q: text.trim() })}
          />
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
  list: { padding: space.lg, flexGrow: 1 },
  header: { gap: space.md, marginBottom: space.sm },
});
