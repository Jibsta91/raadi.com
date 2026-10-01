/**
 * The listings index. Bump INDEX_VERSION when the mapping changes: the
 * service creates the new index, points the alias at it once it is empty
 * of conflicts, and the consumer group can be reset to re-index from Kafka
 * (events are retained for 14 days; the outbox can be replayed beyond that).
 */
export const INDEX_VERSION = 1;

export const indexBody = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    refresh_interval: '1s',
    analysis: {
      normalizer: { lower: { type: 'custom', filter: ['lowercase', 'asciifolding'] } },
      analyzer: {
        // Norwegian stemming ("skiene" matches "ski"), ASCII folding so "ostfold" finds "Østfold".
        nb_text: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'norwegian_stop', 'norwegian_stemmer', 'asciifolding'],
        },
        // Search-as-you-type prefixes for suggestions.
        nb_prefix: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'prefix_ngrams'],
        },
      },
      filter: {
        norwegian_stop: { type: 'stop', stopwords: '_norwegian_' },
        norwegian_stemmer: { type: 'stemmer', language: 'light_norwegian' },
        prefix_ngrams: { type: 'edge_ngram', min_gram: 2, max_gram: 15 },
      },
    },
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      id: { type: 'keyword' },
      ownerId: { type: 'keyword' },
      status: { type: 'keyword' },
      category: { type: 'keyword' },
      subcategory: { type: 'keyword' },
      title: {
        type: 'text',
        analyzer: 'nb_text',
        fields: {
          std: { type: 'text', analyzer: 'standard' },
          prefix: { type: 'text', analyzer: 'nb_prefix', search_analyzer: 'standard' },
          // Exact titles for suggestions (shown as typed).
          raw: { type: 'keyword', ignore_above: 256 },
        },
      },
      description: { type: 'text', analyzer: 'nb_text' },
      priceNok: { type: 'long' },
      attributes: {
        type: 'object',
        dynamic: true,
        properties: {
          condition: { type: 'keyword' },
          fuel: { type: 'keyword' },
          gearbox: { type: 'keyword' },
          propertyType: { type: 'keyword' },
          employmentType: { type: 'keyword' },
          make: { type: 'keyword', normalizer: 'lower' },
          model: { type: 'keyword', normalizer: 'lower' },
          employer: { type: 'keyword', normalizer: 'lower' },
          year: { type: 'integer' },
          mileageKm: { type: 'integer' },
          areaM2: { type: 'integer' },
          bedrooms: { type: 'integer' },
          guests: { type: 'integer' },
        },
      },
      placeId: { type: 'keyword' },
      placeName: { type: 'keyword' },
      county: { type: 'keyword' },
      location: { type: 'geo_point' },
      imageIds: { type: 'keyword', index: false },
      publishedAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
} as const;
