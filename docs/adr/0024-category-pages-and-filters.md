# 0024 — Categories like FINN: category pages, filters per category, a guided new-listing form

- Status: Accepted
- Date: 2026-10-03

## Context

The five top-level categories had a few subcategories each, and the search sidebar showed the same
filters whatever was selected: a car search offered "condition", a job search offered "fuel". People
coming from FINN expect a front page per category, filters that belong to the category, "from – to"
ranges for numbers such as year and mileage, and a new-listing flow that starts by choosing what they
are selling.

## Decision

- **Taxonomy keys never change; new ones are appended.** Subcategory keys are stored on listings, in
  events and in the search index, so renaming one would need a data migration. Torget gains FINN's main
  groups (garden and renovation, antiques and art, animals, vehicle equipment), property gains new homes
  and commercial property, jobs gain office, industry and hospitality. FINN's display names live in the
  message catalogues.
- **New attributes are optional**: `bodyType` and `drivetrain` for cars, `ownership` for property, and
  the property type `commercial`. Existing listings stay valid, and the events need no new schema
  version (attributes are an open map of scalars).
- **The catalog says which filters each category has.** `FACET_ATTRIBUTES` lists the multi-value
  filters (car make, fuel, gearbox, body type, drivetrain; property type and ownership; …) and
  `RANGE_ATTRIBUTES` the numeric ranges (`yearMin`/`yearMax`, `mileage…`, `area…`, `bedrooms…`,
  `guests…`). The search service builds its parameters, facets and range filters from these lists. Web
  and app read the same lists, and a unit test checks that every name exists in the category's
  attribute schema. Search index version 3 maps the new keyword fields. The service re-indexes on start.
- **The search sidebar shows a category's own filters only when exactly one category is selected.**
  Active filters show as removable chips above the results. On phones, the filters open as a
  full-screen sheet with a "Show n results" button. Filter groups use `<details>` and plain links, so
  they work without JavaScript.
- **Each category has its own front page** at `/<locale>/<category>`: subcategory tiles with live
  counts (from the search facets), popular searches, popular car makes, the newest listings and a "post
  in this category" button. The header and the home page link there. In the app, category chips open an
  equivalent screen, search has subcategory chips, and a listing shows its details as a key-info box.
- **A new listing starts with category tiles, then subcategory tiles**, then the form in numbered
  sections (photos, about, details, price and place). `?category=` preselects the category.

## Alternatives considered

- **A deeper tree (three levels, like FINN's Torget):** more choice, but a third level would need a new
  field on listings, events and the index. Two levels cover the demo data and the filters. A third
  level can be added later as an optional field.
- **Per-subcategory attribute schemas** (no mileage for caravans, for example): more precise, but it
  multiplies schemas and forms. For now attributes stay per category, and new subcategories reuse them.
- **Price sliders and a range histogram:** need client-side JavaScript and more aggregation work. Number
  inputs work everywhere and match FINN's "fra – til" fields.

## Consequences

- Adding a filter means: add the attribute to the schema (optional), list it in `FACET_ATTRIBUTES` or
  `RANGE_ATTRIBUTES`, map it in the index (bump `INDEX_VERSION`), add its labels to the web and app
  catalogues, and add it to the search OpenAPI spec (then `./raadi generate`).
- Listings seeded before this change keep their old attributes until a cold start re-seeds the demo
  data. The new filters simply count fewer listings until then.
