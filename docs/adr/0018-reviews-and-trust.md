# 0018 — Reviews and trust: reviews only after a real deal, BankID over OIDC, no national ID stored

- Status: Accepted
- Date: 2026-10-02

## Decision

- The **trust** service owns reviews and identity verification (route `/api/v1/trust/`, database `trust`).
- **Only the two parties of a real deal may review each other.** A review needs all of these:
  - one of the two is the listing's owner (the seller);
  - **both** wrote to the other in a conversation about the listing;
  - the listing is sold (it may have been deleted since);
  - at most `REVIEW_WINDOW_DAYS` (30) have passed since the sale;
  - one review per listing and direction. A withdrawn or removed review stays as a tombstone, so the same
    deal cannot be reviewed again (no rating by trial and error).

  Strangers, other buyers and people who never got an answer cannot leave reviews. That closes the
  cheapest kinds of fake and revenge reviews without manual review.

- **Eligibility comes from events, not from calls to other services.** The service consumes listing events
  (owner, title, status, version) and `message_sent` (who wrote to whom about which listing) into local
  projections. Listing events are applied in version order, so a late, older event cannot undo a sale.
  The decision itself is a pure function, and it is re-checked inside the insert transaction.
- A review is 1–5 stars and an optional comment of up to 1000 characters. The reviewer's display name
  ("Ola N.") is copied from their token when they write the review. `review.published` (ids and the rating,
  never the comment) is written to the outbox in the same transaction. Notifications turns it into an
  in-app notice for the reviewed person. Authors may withdraw their review, and moderators may remove any.
- **Profiles are public:** name, verification badge, rating summary and reviews. Listings still do not
  expose owner ids, so the listing page asks trust for the seller of a listing. **Events never carry
  names** (they are kept in Kafka and later copied to the lakehouse). Display names come from users' own
  tokens when they use trust, and when a buyer reviews a seller, from listings' internal contact API (the
  same one messaging uses, with the buyer's token forwarded; best effort).
  Messaging now returns the counterpart's id to the two participants, so a review can name its subject.
- **Verification is BankID over OIDC** (Authorization Code + PKCE, confidential client, `prompt=login`):
  - The start and callback are browser navigations through the gateway. Forward-auth turns the session
    cookie into the bearer token, and the pending request (state, nonce, PKCE verifier) is stored bound
    to that user. It can be used once, and only by the same user within 10 minutes. That prevents a
    callback being replayed into another account.
  - Only `openid` is requested. Raadi needs to know that a real person signed in, not who they are.
    It stores `verified`, the method and the time, plus an **HMAC of the provider's `sub`** (key from
    OpenBao) to stop one person verifying several accounts. **No national identity number, name or birth
    date is requested or stored.** Users can remove their verification at any time.
  - The provider is configuration (`BANKID_ISSUER`, `BANKID_CLIENT_ID`, optional
    `BANKID_BACKCHANNEL_URL`; the secret comes from OpenBao). In development, `BANKID_MOCK=true` makes
    `keycloak-init` create a **`bankid-mock` realm** in the existing Keycloak with five synthetic test
    people (usernames like `01897000011`, using the synthetic-number convention of adding 80 to the
    month, so they can never be real people). It costs no extra containers or memory. Production points
    the same code at a real BankID OIDC provider.
- Readiness covers PostgreSQL and Kafka. BankID is a soft dependency: while it is down only verification
  fails.

## Alternatives considered

- **Anyone may review any user (with moderation)**: easy to game, and it needs moderators for every
  review.
- **Reviews tied to payments**: payments arrive later and are optional on a classifieds site; most deals
  are cash or Vipps outside Raadi. A two-way conversation plus "sold" is the strongest signal available
  without them, and the payments slice can add "paid through Raadi" as another signal.
- **Synchronous calls to listings and messaging when a review is written**: couples availability, and
  neither service has a "did these two talk about this listing" API.
- **Storing the national identity number (fødselsnummer)** to detect duplicates: personal data with strict
  rules on use (personopplysningsloven § 12), far more than a duplicate check needs. A keyed hash of the
  provider's subject is enough.
- **A separate mock OIDC container** (for example mock-oauth2-server): another JVM in the memory budget,
  when Keycloak already speaks OIDC.
- **Identity brokering in Keycloak (BankID as an identity provider of the `raadi` realm)**: it would let
  users log in with BankID, which is a different feature. Verification would then live in session claims,
  and Keycloak would store the BankID attributes.

## Consequences

Trust learns names only from tokens and the listings API, so someone who never used trust and was never
reviewed as a seller appears as "Raadi-bruker" on their profile. Reviews have no replies yet. Review retention and erasure are
part of the Phase 4 GDPR work. Real BankID needs an agreement with a BankID OIDC provider; the
configuration and the client are ready for one.
