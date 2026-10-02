import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  HealthController,
  HealthRegistry,
  isHealthProbe,
  loggerOptions,
  ProblemDetailsFilter,
  requestId,
  RouteSpanInterceptor,
} from '@raadi/service-kit';
import { LoggerModule } from 'nestjs-pino';
import type { AppConfig } from './config.js';
import { PspController } from './psp.controller.js';
import { APP_CONFIG, PspService } from './psp.service.js';

@Module({})
export class AppModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            ...loggerOptions('payments-mock', cfg.env.LOG_LEVEL),
            genReqId: requestId,
            autoLogging: { ignore: isHealthProbe },
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
      ],
      controllers: [PspController, HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: cfg },
        { provide: HealthRegistry, useValue: new HealthRegistry() },
        PspService,
        { provide: APP_INTERCEPTOR, useClass: RouteSpanInterceptor },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
