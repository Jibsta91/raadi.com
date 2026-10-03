import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { type AuthenticatedRequest, Roles, ZodValidationPipe } from '@raadi/service-kit';
import type { z } from 'zod';
import { type Device, deviceSchema, listQuerySchema, preferencesSchema } from './model.js';
import { NotificationsService } from './notifications.service.js';

@Controller('api/v1/notifications')
@Roles('user')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listQuerySchema)) q: z.infer<typeof listQuerySchema>,
  ) {
    return this.notifications.list(req.principal!, q.limit);
  }

  @Get('unread')
  unread(@Req() req: AuthenticatedRequest) {
    return this.notifications.unread(req.principal!);
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.notifications.markAllRead(req.principal!);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
  ): Promise<void> {
    await this.notifications.markRead(req.principal!, id);
  }

  @Get('preferences')
  preferences(@Req() req: AuthenticatedRequest) {
    return this.notifications.preferences(req.principal!);
  }

  @Put('preferences')
  savePreferences(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(preferencesSchema)) body: z.infer<typeof preferencesSchema>,
  ) {
    return this.notifications.savePreferences(req.principal!, body);
  }

  /** The app registers its push token after sign-in (and again on every start). */
  @Put('devices')
  @HttpCode(204)
  async registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceSchema)) body: Device,
  ): Promise<void> {
    await this.notifications.registerDevice(req.principal!, body);
  }

  /** Sign-out on a device: stop pushing to it. The token is URL-encoded. */
  @Delete('devices/:token')
  @HttpCode(204)
  async removeDevice(
    @Req() req: AuthenticatedRequest,
    @Param('token') token: string,
  ): Promise<void> {
    await this.notifications.removeDevice(req.principal!, token);
  }
}
