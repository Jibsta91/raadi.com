import CircuitBreaker from 'opossum';

export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying (e.g. on 4xx). */
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries with exponential backoff and full jitter. Only use for idempotent work. */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const base = opts.baseDelayMs ?? 200;
  const max = opts.maxDelayMs ?? 10_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= opts.retries || (opts.shouldRetry && !opts.shouldRetry(error))) throw error;
      const delay = Math.round(Math.random() * Math.min(max, base * 2 ** attempt));
      opts.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
}

export interface BreakerOptions {
  name: string;
  timeoutMs?: number;
  errorThresholdPercentage?: number;
  resetTimeoutMs?: number;
  volumeThreshold?: number;
  /** Return true for errors that are the caller's fault; they do not count as failures. */
  errorFilter?: (error: unknown) => boolean;
}

/**
 * Wraps a dependency call in a circuit breaker so a failing dependency fails
 * fast instead of exhausting connections and threads.
 */
export function circuitBreaker<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: BreakerOptions,
): { fire: (...args: A) => Promise<R>; breaker: CircuitBreaker<A, R> } {
  const breaker = new CircuitBreaker<A, R>(fn, {
    name: opts.name,
    timeout: opts.timeoutMs ?? 5000,
    errorThresholdPercentage: opts.errorThresholdPercentage ?? 50,
    resetTimeout: opts.resetTimeoutMs ?? 15_000,
    volumeThreshold: opts.volumeThreshold ?? 5,
    ...(opts.errorFilter ? { errorFilter: opts.errorFilter } : {}),
  });
  return { fire: (...args: A) => breaker.fire(...args), breaker };
}
