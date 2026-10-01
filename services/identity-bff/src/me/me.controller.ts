import { Body, Controller, Get, NotFoundException, Patch, Req } from '@nestjs/common';
import { type AuthenticatedRequest, ZodValidationPipe } from '@raadi/service-kit';
import { z } from 'zod';
import { UsersRepository, type UserProfile } from '../users/users.repository.js';

export const updateMeSchema = z
  .object({
    locale: z.enum(['nb', 'en', 'so']).optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine(
    (v) => v.locale !== undefined || v.displayName !== undefined,
    'Provide at least one field',
  );

export type Me = UserProfile & { roles: string[] };

/** The authenticated user's own profile. Served at the same path internally and via the gateway. */
@Controller('api/v1/identity/me')
export class MeController {
  constructor(private readonly users: UsersRepository) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<Me> {
    const p = req.principal!;
    const profile = await this.users.findById(p.sub);
    if (!profile)
      throw new NotFoundException('Profile not found — log in through the web app first');
    return { ...profile, roles: p.roles.filter((r) => !r.startsWith('default-roles-')) };
  }

  @Patch()
  async update(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateMeSchema)) body: z.infer<typeof updateMeSchema>,
  ): Promise<Me> {
    const p = req.principal!;
    const profile = await this.users.updatePreferences(p.sub, body);
    if (!profile) throw new NotFoundException('Profile not found');
    return { ...profile, roles: p.roles.filter((r) => !r.startsWith('default-roles-')) };
  }
}
