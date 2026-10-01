import { createHmac } from 'node:crypto';

export type ImagePreset = 'thumb' | 'card' | 'large';
export const IMAGE_PRESETS: readonly ImagePreset[] = ['thumb', 'card', 'large'];

export interface ImgproxySigner {
  /** Signature for an unsigned path ("/<processing>/<source>"). */
  sign(unsignedPath: string): string;
  /** Signed path for a processing request, e.g. "/<signature>/pr:card/<source>.webp". */
  path(processing: string, sourceUrl: string, extension?: string): string;
}

/**
 * imgproxy URL signing (HMAC-SHA256 over salt + path, base64url). Only signed
 * URLs are served, so nobody can make imgproxy fetch or resize arbitrary sources.
 */
export function imgproxySigner(keyHex: string, saltHex: string): ImgproxySigner {
  const key = Buffer.from(keyHex, 'hex');
  const salt = Buffer.from(saltHex, 'hex');
  const sign = (unsignedPath: string) =>
    createHmac('sha256', key).update(salt).update(unsignedPath).digest('base64url');
  return {
    sign,
    path(processing, sourceUrl, extension) {
      const source = Buffer.from(sourceUrl).toString('base64url');
      const unsigned = `/${processing}/${source}${extension ? `.${extension}` : ''}`;
      return `/${sign(unsigned)}${unsigned}`;
    },
  };
}

/** Public URLs (served by the gateway under /img) for a stored listing image. */
export function imageUrls(
  signer: ImgproxySigner,
  mediaId: string,
  opts: { publicPrefix?: string; bucket?: string } = {},
): Record<ImagePreset, string> {
  const prefix = opts.publicPrefix ?? '/img';
  const source = `s3://${opts.bucket ?? 'raadi-media'}/${mediaId}`;
  return Object.fromEntries(
    IMAGE_PRESETS.map((preset) => [
      preset,
      `${prefix}${signer.path(`pr:${preset}`, source, 'webp')}`,
    ]),
  ) as Record<ImagePreset, string>;
}
