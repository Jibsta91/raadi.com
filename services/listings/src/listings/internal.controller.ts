import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '@raadi/service-kit';
import { type ListingContact, ListingsService } from './listings.service.js';

/**
 * Service-to-service API. The gateway only routes /api/v1/listings, so this
 * path is reachable on the internal network only, and callers still need a
 * valid user token (zero trust between services).
 */
@Controller('internal/v1/listings')
export class InternalListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** Who to contact about a listing (messaging): owner id, display name, title, status. */
  @Get(':id/contact')
  @Roles('user')
  contact(
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
  ): Promise<ListingContact> {
    return this.listings.contact(id);
  }
}
