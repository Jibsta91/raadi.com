import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthenticatedRequest, Roles, ZodValidationPipe } from '@raadi/service-kit';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { MessagingService } from './messaging.service.js';
import {
  messagesQuerySchema,
  pageSchema,
  type SendMessage,
  sendMessageSchema,
  type StartConversation,
  startConversationSchema,
} from './model.js';

const SEND_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
const uuid = new ParseUUIDPipe({ version: undefined });

@Controller('api/v1/messaging')
@Roles('user')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  /** Contact the seller of a listing (opens or reuses the conversation). */
  @Post('conversations')
  @Throttle(SEND_THROTTLE)
  async start(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(startConversationSchema)) body: StartConversation,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const token = req.headers.authorization!.slice('Bearer '.length);
    const result = await this.messaging.start(req.principal!, token, body);
    void reply
      .status(result.created ? 201 : 200)
      .header('location', `/api/v1/messaging/conversations/${result.conversation.id}`)
      .header('cache-control', 'no-store');
    return { conversation: result.conversation, message: result.message };
  }

  @Get('conversations')
  inbox(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(pageSchema)) page: z.infer<typeof pageSchema>,
  ) {
    return this.messaging.inbox(req.principal!, page.limit, page.offset);
  }

  @Get('conversations/:id')
  detail(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) q: z.infer<typeof messagesQuerySchema>,
  ) {
    return this.messaging.detail(req.principal!, id, q.limit, q.before);
  }

  @Post('conversations/:id/messages')
  @Throttle(SEND_THROTTLE)
  async send(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessage,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const message = await this.messaging.send(req.principal!, id, body.body);
    void reply.status(201);
    return message;
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(@Req() req: AuthenticatedRequest, @Param('id', uuid) id: string): Promise<void> {
    await this.messaging.markRead(req.principal!, id);
  }

  @Get('unread')
  unread(@Req() req: AuthenticatedRequest) {
    return this.messaging.unread(req.principal!);
  }
}
