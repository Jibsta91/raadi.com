import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type AuthenticatedRequest, Roles, ZodValidationPipe } from '@raadi/service-kit';
import type { FastifyReply } from 'fastify';
import {
  type CreateSavedSearch,
  createSavedSearchSchema,
  pageQuerySchema,
  type UpdateSavedSearch,
  updateSavedSearchSchema,
} from './model.js';
import { SavedService } from './saved.service.js';

const uuid = new ParseUUIDPipe({ version: undefined });

@Controller('api/v1/saved')
@Roles('user')
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get('favourites')
  favourites(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(pageQuerySchema)) q: { limit: number; offset: number },
  ) {
    return this.saved.favourites(req.principal!, q.limit, q.offset);
  }

  /** Just the ids, for drawing hearts on listing cards. */
  @Get('favourites/ids')
  favouriteIds(@Req() req: AuthenticatedRequest) {
    return this.saved.favouriteIds(req.principal!);
  }

  @Put('favourites/:listingId')
  @HttpCode(204)
  async addFavourite(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', uuid) listingId: string,
  ): Promise<void> {
    const token = req.headers.authorization!.slice('Bearer '.length);
    await this.saved.addFavourite(req.principal!, token, listingId);
  }

  @Delete('favourites/:listingId')
  @HttpCode(204)
  async removeFavourite(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', uuid) listingId: string,
  ): Promise<void> {
    await this.saved.removeFavourite(req.principal!, listingId);
  }

  @Get('searches')
  savedSearches(@Req() req: AuthenticatedRequest) {
    return this.saved.savedSearches(req.principal!);
  }

  /** 201 for a new saved search, 200 when the same search was already saved. */
  @Post('searches')
  async saveSearch(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createSavedSearchSchema)) body: CreateSavedSearch,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { search, created } = await this.saved.saveSearch(req.principal!, body);
    res.status(created ? 201 : 200);
    return search;
  }

  @Patch('searches/:id')
  updateSearch(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateSavedSearchSchema)) body: UpdateSavedSearch,
  ) {
    return this.saved.updateSearch(req.principal!, id, body);
  }

  @Delete('searches/:id')
  @HttpCode(204)
  async deleteSearch(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    await this.saved.deleteSearch(req.principal!, id);
  }

  /** The user opened the search: the "new" badge starts again from zero. */
  @Post('searches/:id/seen')
  @HttpCode(204)
  async markSeen(@Req() req: AuthenticatedRequest, @Param('id', uuid) id: string): Promise<void> {
    await this.saved.markSeen(req.principal!, id);
  }
}
