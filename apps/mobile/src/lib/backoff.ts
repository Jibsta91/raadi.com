// Reconnect delays for the messaging WebSocket; unit-tested in test/backoff.test.ts.

/** Exponential backoff with full jitter: 1 s, 2 s, 4 s … capped at 30 s. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
