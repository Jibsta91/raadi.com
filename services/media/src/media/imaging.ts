import type { ImgproxySigner } from '@raadi/service-kit';
import { circuitBreaker, retry } from '@raadi/service-kit';

export type SupportedType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Identifies the real format from the first bytes (magic numbers); the
 * client-supplied Content-Type and file name are never trusted.
 */
export function sniffImageType(data: Buffer): SupportedType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.toString('latin1', 0, 4) === 'RIFF' &&
    data.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Width/height from a baseline or progressive JPEG (SOF0–SOF15 except DHT/JPG/DAC). */
export function jpegDimensions(data: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) return null;
    const marker = data[i + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = data.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

export class InvalidImageError extends Error {}

/**
 * Re-encodes an image through imgproxy: decodes it (proving it is a real
 * image), bounds its size, strips EXIF/XMP metadata (GPS position, camera
 * serials) and applies the EXIF orientation. The result is what we store.
 */
export class ImageSanitizer {
  private readonly breaker;

  constructor(
    private readonly baseUrl: string,
    private readonly signer: ImgproxySigner,
  ) {
    this.breaker = circuitBreaker(
      (path: string) =>
        retry(
          async () => {
            const res = await fetch(`${this.baseUrl}${path}`, {
              signal: AbortSignal.timeout(20_000),
            });
            if (res.status >= 400 && res.status < 500)
              throw new InvalidImageError(`imgproxy rejected the image (${res.status})`);
            if (!res.ok) throw new Error(`imgproxy returned ${res.status}`);
            return Buffer.from(await res.arrayBuffer());
          },
          { retries: 2, baseDelayMs: 200, shouldRetry: (e) => !(e instanceof InvalidImageError) },
        ),
      // A bad upload is the client's problem, not imgproxy's: it must not open the circuit.
      { name: 'imgproxy', timeoutMs: 65_000, errorFilter: (e) => e instanceof InvalidImageError },
    );
  }

  /** Returns a metadata-free JPEG no larger than maxSide × maxSide. */
  async sanitize(
    sourceUrl: string,
    maxSide = 2560,
  ): Promise<{ data: Buffer; width: number; height: number }> {
    const path = this.signer.path(`rs:fit:${maxSide}:${maxSide}/q:86/sm:1`, sourceUrl, 'jpg');
    const data = await this.breaker.fire(path);
    const dims = jpegDimensions(data);
    if (!dims) throw new InvalidImageError('re-encoded image has no readable dimensions');
    return { data, ...dims };
  }
}
