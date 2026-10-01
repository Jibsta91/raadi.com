import {
  type ArgumentsHost,
  type CallHandler,
  Catch,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  type PipeTransform,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { trace } from '@opentelemetry/api';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import type { z } from 'zod';
import { JwtVerifier, type Principal } from './jwt.js';

// ---------------------------------------------------------------------------
// Errors: RFC 9457 problem+json, never leaking internals.
// ---------------------------------------------------------------------------
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail =
      status >= 500
        ? 'An unexpected error occurred.'
        : typeof body === 'string'
          ? body
          : ((body as { message?: unknown })?.message ?? undefined);

    if (status >= 500) this.logger.error({ err: exception, path: req.url }, 'request failed');

    const problem: Record<string, unknown> = {
      type: 'about:blank',
      title: HttpStatus[status]?.replaceAll('_', ' ').toLowerCase() ?? 'error',
      status,
      instance: req.url,
      traceId: trace.getActiveSpan()?.spanContext().traceId,
    };
    if (Array.isArray(detail)) problem.errors = detail;
    else if (detail !== undefined) problem.detail = detail;
    const errors = (body as { errors?: unknown } | undefined)?.errors;
    if (errors) problem.errors = errors;

    void reply.status(status).header('content-type', 'application/problem+json').send(problem);
  }
}

// ---------------------------------------------------------------------------
// Validation: zod schemas at the edge of every handler.
// ---------------------------------------------------------------------------
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

// ---------------------------------------------------------------------------
// AuthN/Z: every non-public route requires a valid JWT; @Roles adds RBAC.
// ---------------------------------------------------------------------------
export const IS_PUBLIC = 'raadi:isPublic';
export const ROLES = 'raadi:roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);

export type AuthenticatedRequest = FastifyRequest & { principal?: Principal };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      req.principal = await this.verifier.verify(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    trace.getActiveSpan()?.setAttribute('enduser.id', req.principal.sub);

    const required = this.reflector.getAllAndOverride<string[]>(ROLES, targets);
    if (required?.length && !required.some((r) => req.principal!.roles.includes(r))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Tracing: name server spans after the matched route ("GET /me").
// ---------------------------------------------------------------------------
@Injectable()
export class RouteSpanInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const route = req.routeOptions?.url;
    const span = trace.getActiveSpan();
    if (span && route) {
      span.setAttribute('http.route', route);
      span.updateName(`${req.method} ${route}`);
    }
    return next.handle();
  }
}
