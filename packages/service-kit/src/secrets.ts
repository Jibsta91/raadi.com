import type { z } from 'zod';
import type { openBaoEnvSchema } from './config.js';
import { OpenBaoClient } from './openbao.js';

/**
 * Logs in with the service's AppRole and reads KV secrets. `paths` maps a
 * prefix to a KV path; keys come back as "<prefix>.<key>" (the service's own
 * path uses the empty prefix), e.g. { '': 'raadi/listings', imgproxy: 'raadi/shared/imgproxy' }.
 */
export async function readSecrets(
  env: z.infer<typeof openBaoEnvSchema>,
  paths: Record<string, string>,
): Promise<Record<string, string>> {
  const bao = new OpenBaoClient({
    addr: env.OPENBAO_ADDR,
    roleIdFile: env.OPENBAO_ROLE_ID_FILE,
    secretIdFile: env.OPENBAO_SECRET_ID_FILE,
  });
  await bao.login();
  try {
    const entries = await Promise.all(
      Object.entries(paths).map(async ([prefix, path]) => {
        const values = await bao.readKv(path);
        return Object.entries(values).map(([k, v]) => [prefix ? `${prefix}.${k}` : k, v] as const);
      }),
    );
    return Object.fromEntries(entries.flat());
  } finally {
    bao.close();
  }
}
