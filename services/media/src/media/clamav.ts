import { connect } from 'node:net';
import { circuitBreaker } from '@raadi/service-kit';

export type ScanResult = { clean: true } | { clean: false; signature: string };

export class ScannerUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ScannerUnavailableError';
  }
}

const CHUNK = 64 * 1024;

/**
 * Parses a clamd INSTREAM reply ("stream: OK" or "stream: <name> FOUND").
 * Anything else (e.g. "INSTREAM size limit exceeded. ERROR") is an error, never "clean".
 */
export function parseReply(reply: string): ScanResult {
  const text = reply.replace(/\0/g, '').trim();
  if (text === 'stream: OK') return { clean: true };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found) return { clean: false, signature: found[1]! };
  throw new Error(`unexpected clamd reply: ${text.slice(0, 200)}`);
}

/** Streams a buffer to clamd over TCP (zINSTREAM) and returns the verdict. */
function scanOnce(
  host: string,
  port: number,
  data: Buffer,
  timeoutMs: number,
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('clamd timed out')));
    socket.once('error', reject);
    socket.on('data', (d: Buffer) => chunks.push(d));
    socket.once('end', () => {
      try {
        resolve(parseReply(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    socket.once('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.subarray(i, i + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.end(Buffer.alloc(4)); // zero-length chunk terminates the stream
    });
  });
}

export class ClamAvScanner {
  private readonly breaker;

  constructor(
    private readonly host: string,
    private readonly port: number,
    timeoutMs = 30_000,
  ) {
    this.breaker = circuitBreaker((data: Buffer) => scanOnce(host, port, data, timeoutMs), {
      name: 'clamav',
      timeoutMs: timeoutMs + 1000,
      volumeThreshold: 3,
    });
  }

  /** Fails closed: an unreachable scanner rejects the upload instead of skipping the scan. */
  async scan(data: Buffer): Promise<ScanResult> {
    try {
      return await this.breaker.fire(data);
    } catch (error) {
      throw new ScannerUnavailableError('virus scanner unavailable', { cause: error });
    }
  }

  ping(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      let reply = '';
      socket.setTimeout(1500, () => socket.destroy(new Error('clamd ping timed out')));
      socket.once('error', reject);
      socket.on('data', (d: Buffer) => (reply += d.toString()));
      socket.once('end', () =>
        reply.replace(/\0/g, '').trim() === 'PONG'
          ? resolve()
          : reject(new Error(`clamd replied ${reply}`)),
      );
      socket.once('connect', () => socket.end('zPING\0'));
    });
  }
}
