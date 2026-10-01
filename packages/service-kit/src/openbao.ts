import { readFile } from 'node:fs/promises';
import { retry } from './resilience.js';

export interface OpenBaoOptions {
  addr: string;
  roleIdFile: string;
  secretIdFile: string;
  /** KV v2 mount (default "secret"). */
  mount?: string;
  fetch?: typeof fetch;
}

interface LoginState {
  token: string;
  renewable: boolean;
  leaseSeconds: number;
}

/**
 * Minimal OpenBao (Vault-API compatible) client: AppRole login, KV v2 reads
 * and background token renewal. Credentials come from files mounted by the
 * platform; nothing secret is passed through environment variables.
 */
export class OpenBaoClient {
  private state?: LoginState;
  private renewTimer?: NodeJS.Timeout;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenBaoOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async login(): Promise<void> {
    const [roleId, secretId] = await Promise.all([
      readFile(this.opts.roleIdFile, 'utf8'),
      readFile(this.opts.secretIdFile, 'utf8'),
    ]);
    const body = await retry(
      () =>
        this.request('POST', '/v1/auth/approle/login', {
          role_id: roleId.trim(),
          secret_id: secretId.trim(),
        }),
      { retries: 8, baseDelayMs: 500, shouldRetry: isTransient },
    );
    const auth = (
      body as { auth: { client_token: string; renewable: boolean; lease_duration: number } }
    ).auth;
    this.state = {
      token: auth.client_token,
      renewable: auth.renewable,
      leaseSeconds: auth.lease_duration,
    };
    this.scheduleRenewal();
  }

  /** Reads all keys of a KV v2 secret, e.g. readKv("raadi/identity-bff"). */
  async readKv(path: string): Promise<Record<string, string>> {
    const mount = this.opts.mount ?? 'secret';
    const body = await retry(() => this.request('GET', `/v1/${mount}/data/${path}`), {
      retries: 5,
      shouldRetry: isTransient,
    });
    return (body as { data: { data: Record<string, string> } }).data.data;
  }

  close(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
  }

  private scheduleRenewal(): void {
    if (!this.state?.renewable) return;
    const inMs = Math.max(30, this.state.leaseSeconds * 0.66) * 1000;
    this.renewTimer = setTimeout(() => {
      this.request('POST', '/v1/auth/token/renew-self', {})
        .then((body) => {
          const auth = (body as { auth: { lease_duration: number } }).auth;
          if (this.state) this.state.leaseSeconds = auth.lease_duration;
        })
        .catch(() => this.login())
        .catch(() => undefined)
        .finally(() => this.scheduleRenewal());
    }, inMs);
    this.renewTimer.unref();
  }

  private async request(method: string, path: string, json?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(new URL(path, this.opts.addr), {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.state ? { 'x-vault-token': this.state.token } : {}),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new OpenBaoError(res.status, `${method} ${path} failed with ${res.status}`);
    return res.json();
  }
}

export class OpenBaoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenBaoError';
  }
}

function isTransient(error: unknown): boolean {
  if (error instanceof OpenBaoError) return error.status >= 500 || error.status === 429;
  return true; // network errors, timeouts
}
