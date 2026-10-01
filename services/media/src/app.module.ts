import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  createPgPool,
  FgaClient,
  HealthController,
  HealthRegistry,
  imgproxySigner,
  JwtAuthGuard,
  JwtVerifier,
  keycloakVerifier,
  loggerOptions,
  ProblemDetailsFilter,
  requestId,
  RouteSpanInterceptor,
} from '@raadi/service-kit';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config.js';
import { Lifecycle } from './lifecycle.js';
import { ClamAvScanner } from './media/clamav.js';
import { ImageSanitizer } from './media/imaging.js';
import { MediaController } from './media/media.controller.js';
import { MediaRepository } from './media/media.repository.js';
import { MediaService, SIGNER } from './media/media.service.js';
import { MediaStorage } from './media/storage.js';
import { MediaWorkers } from './media/workers.js';
import { APP_CONFIG, PG_POOL } from './tokens.js';

@Module({})
export class AppModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    const { env, secrets } = cfg;
    const signer = imgproxySigner(secrets['imgproxy.key'], secrets['imgproxy.salt']);
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            ...loggerOptions('media', env.LOG_LEVEL),
            genReqId: requestId,
            autoLogging: { ignore: (req) => /^\/(healthz|readyz)/.test(req.url ?? '') },
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url.split('?')[0],
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
          },
        }),
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }],
          skipIf: (ctx) => ctx.getClass() === HealthController,
        }),
      ],
      controllers: [MediaController, HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: cfg },
        { provide: PG_POOL, useFactory: () => createPgPool(env, secrets.db_password, 'media') },
        { provide: JwtVerifier, useValue: keycloakVerifier(env) },
        { provide: HealthRegistry, useValue: new HealthRegistry() },
        {
          provide: FgaClient,
          useValue: new FgaClient({ url: env.OPENFGA_URL, apiKey: secrets.fga_key }),
        },
        { provide: SIGNER, useValue: signer },
        { provide: MediaStorage, useValue: new MediaStorage(env, secrets.s3_secret) },
        { provide: ClamAvScanner, useValue: new ClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) },
        {
          provide: ImageSanitizer,
          useValue: new ImageSanitizer(env.IMGPROXY_INTERNAL_URL, signer),
        },
        MediaRepository,
        MediaService,
        MediaWorkers,
        Lifecycle,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: RouteSpanInterceptor },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
