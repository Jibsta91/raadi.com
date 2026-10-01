# 0015 — Search: OpenSearch fed by listing events

- Status: Accepted
- Date: 2026-10-01

## Decision

- **OpenSearch** (Apache-2.0) holds a read model of active listings, owned by the **search** service. The
  index is fed only by `raadi.listing.events` ([ADR-0012](0012-event-backbone.md)). Search never reads the
  listings database.
- Writes use the **listing version as an external version** (`version_type: external`). Redelivered or
  out-of-order events are rejected by OpenSearch itself, so the consumer is idempotent with no extra state.
  Removals delete with the same version check.
- The index is versioned (`raadi-listings-v<N>`) behind the `raadi-listings` alias. After a mapping change
  (`INDEX_VERSION` bump) the service creates the new index, copies the documents with `_reindex` (keeping
  their external versions) and moves the alias atomically, before its consumer starts. Resetting the
  `search-indexer` group to the start of the topic (events are kept for 14 days) rebuilds from scratch.
- Text uses a Norwegian analyzer (light stemmer, stop words, ASCII folding) with `fuzziness: AUTO` for
  typos. Titles also have an edge-n-gram subfield for search-as-you-type.
- **Facets**: text, price and geo constraints filter the whole result set. Facet selections are applied as a
  `post_filter`, and each facet's aggregation applies every selection except its own, so selecting "bil"
  still shows how many results the other categories have. Facets: category, subcategory, county, condition,
  fuel, property type, employment type and price ranges.
- **Geo**: listings have a `geo_point` from the catalog place. Search supports a radius around a place or the
  browser's position, distance sorting, and returns the distance per hit.
- The public API (`GET /api/v1/search/listings`, `/suggest`) is anonymous. It validates every parameter
  with zod, caps page depth (200 pages of at most 48) and is rate-limited at the gateway.

## Alternatives considered

- **Elasticsearch**: SSPL/Elastic License for years. AGPL was added as an option in 8.16, but OpenSearch has
  been Apache-2.0 throughout, so it carries no licensing risk under
  [ADR-0009](0009-open-source-licensing-policy.md).
- **PostgreSQL full-text + PostGIS**: enough for a small site, but faceting with per-facet counts and fuzzy
  Norwegian matching would be hand-written SQL in the listings service.
- **Meilisearch / Typesense**: lighter, but with less control over facets, geo and analyzers. OpenSearch
  also offers k-NN vector search for the Phase 4 AI work.

## Consequences

Search is eventually consistent: a new listing appears after the outbox → Debezium → Kafka → indexer hop.
The `raadi_search_index_lag` metric and consumer-lag alerts track the delay. OpenSearch runs with a 384 MB
heap and its unused plugins removed (about 710 MB RSS). The security plugin is enabled, and the search
service's user may only manage `raadi-listings*` indices.
