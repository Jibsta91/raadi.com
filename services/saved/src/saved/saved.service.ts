import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { parseEvent } from '@raadi/events';
import type { ImgproxySigner, Principal } from '@raadi/service-kit';
import { PermanentEventError, type ReceivedEvent } from '@raadi/service-kit/kafka';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { ListingsClient, SearchClient } from './clients.js';
import {
  type CreateSavedSearch,
  type Favourite,
  type SavedSearch,
  toFavourite,
  toSavedSearch,
  type UpdateSavedSearch,
} from './model.js';
import { SavedRepository } from './saved.repository.js';

export const SIGNER = Symbol('IMGPROXY_SIGNER');

const meter = metrics.getMeter('saved');
const alerts = meter.createCounter('raadi.saved.alerts', {
  description: 'Alerts raised, by kind (price_drop, sold, search_match)',
});
const checks = meter.createCounter('raadi.saved.search_checks', {
  description: 'Saved-search checks, by outcome (matches, none, failed)',
});

@Injectable()
export class SavedService {
  private readonly logger = new Logger(SavedService.name);

  constructor(
    private readonly repo: SavedRepository,
    private readonly listings: ListingsClient,
    private readonly search: SearchClient,
    @Inject(SIGNER) private readonly signer: ImgproxySigner,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  // ---------------------------------------------------------- favourites

  async favourites(principal: Principal, limit: number, offset: number) {
    const page = await this.repo.favourites(principal.sub, limit, offset);
    return {
      total: page.total,
      limit,
      offset,
      items: page.items.map((row): Favourite => toFavourite(row, this.signer)),
    };
  }

  async favouriteIds(principal: Principal) {
    return { ids: await this.repo.favouriteIds(principal.sub) };
  }

  async addFavourite(principal: Principal, token: string, listingId: string): Promise<void> {
    let listing;
    try {
      listing = await this.listings.listing(listingId, token);
    } catch (error) {
      this.logger.warn({ err: error, listingId }, 'listings unavailable');
      throw new ServiceUnavailableException('Listings are unavailable, try again shortly.');
    }
    if (!listing || listing.status === 'deleted') throw new NotFoundException('Listing not found');
    if (listing.viewer?.isOwner)
      this.refuse('listingId', 'own_listing', 'This is your own listing.');
    const result = await this.repo.favourite(principal.sub, listing, this.cfg.env.MAX_FAVOURITES);
    if (result === 'full') {
      this.refuse('listingId', 'too_many_favourites', 'You have reached the limit of favourites.');
    }
  }

  removeFavourite(principal: Principal, listingId: string): Promise<void> {
    return this.repo.unfavourite(principal.sub, listingId);
  }

  // ------------------------------------------------------ saved searches

  async savedSearches(principal: Principal): Promise<{ items: SavedSearch[] }> {
    return { items: (await this.repo.savedSearches(principal.sub)).map(toSavedSearch) };
  }

  async saveSearch(
    principal: Principal,
    input: CreateSavedSearch,
  ): Promise<{ search: SavedSearch; created: boolean }> {
    const result = await this.repo.saveSearch(
      principal.sub,
      input,
      this.cfg.env.MAX_SAVED_SEARCHES,
    );
    if (result === 'full') {
      this.refuse(
        'params',
        'too_many_saved_searches',
        'You have reached the limit of saved searches.',
      );
    }
    return { search: toSavedSearch(result.row), created: result.created };
  }

  async updateSearch(principal: Principal, id: string, change: UpdateSavedSearch) {
    const row = await this.repo.updateSearch(principal.sub, id, change);
    if (!row) throw new NotFoundException('Saved search not found');
    return toSavedSearch(row);
  }

  async deleteSearch(principal: Principal, id: string): Promise<void> {
    if (!(await this.repo.deleteSearch(principal.sub, id)))
      throw new NotFoundException('Saved search not found');
  }

  async markSeen(principal: Principal, id: string): Promise<void> {
    if (!(await this.repo.markSeen(principal.sub, id)))
      throw new NotFoundException('Saved search not found');
  }

  // -------------------------------------------------------------- events

  /** Listing events: keep favourited listings current and alert on price drops and sales. */
  async onEvent(event: ReceivedEvent): Promise<void> {
    let parsed;
    try {
      parsed = parseEvent(event.value);
    } catch (error) {
      throw new PermanentEventError('event violates its contract', { cause: error });
    }
    if (!parsed) return;
    switch (parsed.type) {
      case 'no.raadi.listings.listing.updated.v1': {
        const { listing } = parsed.data;
        await this.repo.once(parsed.id, async (db) => {
          const raised = await this.repo.applyListing(db, listing);
          await this.repo.alert(db, raised);
          for (const a of raised) alerts.add(1, { kind: a.kind });
        });
        return;
      }
      case 'no.raadi.listings.listing.deleted.v1': {
        const { listingId, version } = parsed.data;
        await this.repo.once(parsed.id, (db) => this.repo.markDeleted(db, listingId, version));
        return;
      }
      default:
        return;
    }
  }

  // ------------------------------------------------------------- matcher

  /** Checks due saved searches for new listings; returns how many were checked. */
  async checkDueSearches(batch = 20): Promise<number> {
    const intervalMs = this.cfg.env.SAVED_SEARCH_INTERVAL_SECONDS * 1000;
    const due = await this.repo.claimDueSearches(batch, intervalMs);
    for (const search of due) {
      const until = new Date(Date.now() - this.cfg.env.SAVED_SEARCH_LAG_SECONDS * 1000);
      if (until <= search.checked_until) {
        await this.repo.recordCheck(search, search.checked_until, 0, intervalMs);
        continue;
      }
      try {
        const matches = await this.search.newMatches(search.params, search.checked_until, until);
        await this.repo.recordCheck(search, until, matches, intervalMs);
        checks.add(1, { outcome: matches > 0 ? 'matches' : 'none' });
        if (matches > 0) alerts.add(1, { kind: 'search_match' });
      } catch (error) {
        // The lease already moved next_run_at: the same window is tried again next time.
        checks.add(1, { outcome: 'failed' });
        this.logger.warn({ err: error, savedSearchId: search.id }, 'saved search check failed');
      }
    }
    return due.length;
  }

  private refuse(path: string, code: string, message: string): never {
    throw new UnprocessableEntityException({ message, errors: [{ path, message, code }] });
  }
}
