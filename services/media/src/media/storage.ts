import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Env } from '../config.js';

/**
 * Object storage (SeaweedFS S3 API). Two buckets: raadi-uploads holds raw
 * uploads only while they are scanned and re-encoded; raadi-media holds the
 * sanitized images that imgproxy serves.
 */
export class MediaStorage {
  private readonly s3: S3Client;

  constructor(
    private readonly env: Env,
    secretKey: string,
  ) {
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: secretKey },
      maxAttempts: 3,
    });
  }

  get mediaBucket() {
    return this.env.MEDIA_BUCKET;
  }

  get uploadBucket() {
    return this.env.UPLOAD_BUCKET;
  }

  /** The service owns its buckets, like its database schema. */
  async ensureBuckets(): Promise<void> {
    for (const Bucket of [this.mediaBucket, this.uploadBucket]) {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await this.s3
          .send(new CreateBucketCommand({ Bucket }))
          .catch((error: { name?: string }) => {
            if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists')
              throw error;
          });
      }
    }
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async ping(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.mediaBucket }));
  }

  close(): void {
    this.s3.destroy();
  }
}
