// Contract test: responses produced by the controllers must satisfy the
// published OpenAPI document (which also generates @raadi/api-client).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { MeController, updateMeSchema } from '../../src/me/me.controller.js';
import type { UserProfile } from '../../src/users/users.repository.js';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });
const validator = (name: string) => ajv.compile({ $ref: `spec#/components/schemas/${name}` });

const profile: UserProfile = {
  id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
  email: 'kari.nordmann@raadi.localhost',
  displayName: 'Kari Nordmann',
  locale: 'nb',
  createdAt: new Date().toISOString(),
  lastLoginAt: null,
};

describe('OpenAPI contract', () => {
  it('GET /me matches the Me schema', async () => {
    const controller = new MeController({ findById: async () => profile } as never);
    const body = await controller.get({
      principal: { sub: profile.id, roles: ['user', 'default-roles-raadi'] },
    } as never);
    const validate = validator('Me');
    assert.ok(validate(body), JSON.stringify(validate.errors));
    assert.deepEqual(body.roles, ['user']);
  });

  it('Session schema accepts both session shapes', () => {
    const validate = validator('Session');
    assert.ok(validate({ authenticated: false }));
    assert.ok(
      validate({
        authenticated: true,
        user: { id: profile.id, email: profile.email, locale: 'nb', roles: ['user'] },
      }),
      JSON.stringify(validate.errors),
    );
    assert.ok(!validate({ authenticated: true, accessToken: 'leak' }));
  });

  it('request validation agrees with the UpdateMe schema', () => {
    const validate = validator('UpdateMe');
    for (const body of [{ locale: 'so' }, { displayName: 'Kari' }]) {
      assert.ok(validate(body));
      assert.ok(updateMeSchema.safeParse(body).success);
    }
    for (const body of [{}, { locale: 'de' }, { isAdmin: true }]) {
      assert.ok(!validate(body));
      assert.ok(!updateMeSchema.safeParse(body).success);
    }
  });
});
