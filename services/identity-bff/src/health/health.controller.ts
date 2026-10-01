import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthRegistry, Public } from '@raadi/service-kit';
import type { FastifyReply } from 'fastify';

@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthRegistry) {}

  /** Liveness: the process is up and the event loop responds. */
  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable and not draining. */
  @Get('readyz')
  async readiness(@Res() reply: FastifyReply): Promise<void> {
    const report = await this.health.readiness();
    void reply.status(report.status === 'ok' ? 200 : 503).send(report);
  }
}
