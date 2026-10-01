export type HealthCheck = () => Promise<void>;

export interface ReadinessReport {
  status: 'ok' | 'error' | 'draining';
  checks: Record<string, { status: 'ok' | 'error'; error?: string; durationMs: number }>;
}

/**
 * Liveness answers "is the process alive" (always cheap).
 * Readiness runs dependency checks with a timeout and flips to "draining"
 * during graceful shutdown so the gateway stops sending traffic first.
 */
export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();
  private draining = false;

  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  startDraining(): void {
    this.draining = true;
  }

  async readiness(timeoutMs = 2000): Promise<ReadinessReport> {
    const entries = await Promise.all(
      [...this.checks].map(async ([name, check]) => {
        const started = performance.now();
        try {
          await Promise.race([
            check(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutMs).unref(),
            ),
          ]);
          return [
            name,
            { status: 'ok' as const, durationMs: Math.round(performance.now() - started) },
          ] as const;
        } catch (error) {
          return [
            name,
            {
              status: 'error' as const,
              error: error instanceof Error ? error.message : String(error),
              durationMs: Math.round(performance.now() - started),
            },
          ] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    const failed = entries.some(([, r]) => r.status === 'error');
    return { status: this.draining ? 'draining' : failed ? 'error' : 'ok', checks };
  }
}
