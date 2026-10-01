import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, Roles } from '@raadi/service-kit';
import type { FastifyReply } from 'fastify';
import { type MediaView, MediaService } from './media.service.js';

type MultipartRequest = AuthenticatedRequest & {
  isMultipart(): boolean;
  file(): Promise<{ fieldname: string; toBuffer(): Promise<Buffer> } | undefined>;
};

@Controller('api/v1/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** multipart/form-data with one "file" part (JPEG, PNG or WebP, ≤ 10 MB). */
  @Post()
  @Roles('user')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async upload(
    @Req() req: MultipartRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MediaView> {
    if (!req.isMultipart())
      throw new BadRequestException('Expected multipart/form-data with a "file" part');
    const part = await req.file();
    if (!part || part.fieldname !== 'file') throw new BadRequestException('Missing "file" part');
    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch (error) {
      if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new PayloadTooLargeException('Images may be at most 10 MB');
      }
      throw error;
    }
    if (data.length === 0) throw new BadRequestException('The file is empty');
    const media = await this.media.upload(req.principal!, data);
    void reply.status(201).header('location', `/api/v1/media/${media.id}`);
    return media;
  }

  @Get(':id')
  @Roles('user')
  get(
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.get(req.principal!, id);
  }

  @Delete(':id')
  @Roles('user')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.media.remove(req.principal!, id);
  }
}
