import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Valkey } from './clients.js';

// Atomic fixed-window counter with optional block period.
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if blocked <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return {hits, ttl, blocked}
`;

/** Rate-limit state in Valkey so limits hold across replicas (services stay stateless). */
export class ValkeyThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly valkey: Valkey) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const base = `bff:throttle:${throttlerName}:${key}`;
    const [hits, ttlMs, blockedMs] = (await this.valkey.eval(
      SCRIPT,
      2,
      `${base}:hits`,
      `${base}:blocked`,
      String(ttl),
      String(limit),
      String(blockDuration > 0 ? blockDuration : ttl),
    )) as [number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked: blockedMs > 0,
      timeToBlockExpire: Math.max(0, Math.ceil(blockedMs / 1000)),
    };
  }
}
