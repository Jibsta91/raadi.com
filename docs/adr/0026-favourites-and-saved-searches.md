# 0026 — Favourites and saved searches: a `saved` service, alerts as events, searches re-run through the search API

- Status: Accepted
- Date: 2026-10-04

## Context

People on FINN keep favourites ("Favoritter") and saved searches ("Lagrede søk") and expect to hear when a
favourite gets cheaper or is sold, and when a saved search has new matches. Raadi had neither. Both belong to
the user, need their own state, and turn into notifications through the channels ADR-0017 and ADR-0025 built.

## Decision

- **A new service, `saved`**, with its own database (one database per service). It owns favourites, saved
  searches and a small projection of favourited listings. The API is under `/api/v1/saved/` behind the
  gateway's forward-auth: favourites (`GET`, `GET …/ids` for hearts on cards, `PUT`/`DELETE …/{listingId}`) and
  saved searches (`GET`, `POST`, `PATCH`, `DELETE`, `POST …/{id}/seen`). Limits per user: 500 favourites and 25
  saved searches.
- **Favourites keep a copy of the listing**, taken from the listings API with the user's token when the heart
  is pressed (zero trust; listings also says whether the caller owns it, and own listings are refused). After
  that, the copy follows `raadi.listing.events`. Only listings that are someone's favourite are kept. Sold
  listings stay on the list, marked sold; deleted ones disappear.
- **Price drops and sales become `no.raadi.saved.alert.v1` events** (outbox → `raadi.alert.events`, keyed by
  user). The event carries ids and prices only: no titles, no names. Owners are never alerted about their own
  listing.
- **Saved searches are re-run through the search API**, never matched separately. A matcher claims due
  searches with a lease (`FOR UPDATE SKIP LOCKED`, so any number of instances can run) and asks search how
  many listings were published in `(checked_until, now − lag]` (`publishedAfter`/`publishedBefore`, new search
  parameters). The 30-second lag covers indexing delay, so nothing slips between two checks. The window only
  moves forward when the check succeeds, and a guard stops two checks of the same window. New matches raise
  the search's "new" count and an alert. The interval is `SAVED_SEARCH_INTERVAL_SECONDS` (20 s in development,
  minutes in production).
- **A saved search is the search API's own query**, validated by the same schema search uses (moved to
  `@raadi/catalog/search-params`). Paging, sorting and time windows are dropped and the keys sorted, so the
  same search saved twice is one row.
- **notifications turns alerts into messages**:
  - price drop and sold: an in-app notice and a push;
  - new matches: one growing in-app notice per saved search (its count rises until it is read), a push at
    most once an hour per search, and an e-mail at most once a day per search.
    Each saved search has its own alert switch. Links open the listing, or `/my/saved-searches?open=<id>`, which
    resets the count and shows the results.
- **Web and app**: a heart on every listing card and on the listing page, Favourites and Saved searches pages
  (web) and screens (app), "Save search" on the results, links in the account menu and on the app's account
  screen. A "new matches" push opens the saved search in the app.

## Alternatives considered

- **Favourites in listings, saved searches in search**: fewer services, but listings would gain per-user
  state, and search (a stateless indexer) would need a database and an outbox.
- **OpenSearch percolator** (store saved searches as queries, match each new listing against them): instant
  matches and efficient at large scale, but it duplicates search's query building in a second place, which
  drifts. Re-running searches is simpler and always matches what people see. The matcher can move to a
  percolator later behind the same tables and events.
- **Alerts written directly by `saved` into notifications' API**: tighter coupling and no replay. An event
  keeps notifications the only place that knows about channels, languages and throttling.
- **Listing titles in alerts**: friendlier notices, but events never carry free text from users (GDPR, ADR
  0012). The notice links to the listing instead.

## Consequences

- A new container (≈ 180 MB of its 256 MB limit; see ADR-0011), a Kafka user and topic, and a Debezium
  connector for the outbox. The manifest drives all of it.
- Search gets one request per due saved search per interval. With 25 searches per user that is fine for the
  demo and small production loads. A percolator is the plan if it becomes a cost.
- Account deletion (Phase 4 GDPR work) must delete favourites and saved searches too.
