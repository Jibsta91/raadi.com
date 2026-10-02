import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ListingCard } from '../../components/listing-card';
import { Field, Status, Title } from '../../components/ui';
import { useI18n } from '../../i18n';
import { unwrap, useApi, useLoad } from '../../lib/api';
import { space } from '../../theme';

export default function Home() {
  const { m } = useI18n();
  const api = useApi();
  const [q, setQ] = useState('');
  const latest = useLoad(
    async () =>
      unwrap(
        await api.search.GET('/api/v1/search/listings', {
          params: { query: { sort: 'newest', pageSize: 24 } },
        }),
      ),
    [api],
  );

  const submit = () => {
    const query = q.trim();
    router.push(query ? { pathname: '/search', params: { q: query } } : '/search');
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={latest.data?.items ?? []}
      keyExtractor={(hit) => hit.id}
      renderItem={({ item }) => <ListingCard hit={item} />}
      onRefresh={latest.reload}
      refreshing={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Field
            testID="home-search"
            value={q}
            onChangeText={setQ}
            placeholder={m.home.searchPlaceholder}
            returnKeyType="search"
            onSubmitEditing={submit}
            accessibilityLabel={m.search.placeholder}
          />
          <Title>{m.home.latest}</Title>
        </View>
      }
      ListEmptyComponent={
        <Status loading={latest.loading} error={latest.error} onRetry={latest.reload} />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, flexGrow: 1 },
  header: { gap: space.lg, marginBottom: space.sm },
});
