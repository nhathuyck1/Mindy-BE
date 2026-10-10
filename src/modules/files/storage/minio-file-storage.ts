import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs the runtime constructor.
import { ConfigService } from '@nestjs/config';
import type { FileStorage, ObjectVersion, StorageLocation } from '../files.contracts.js';

@Injectable()
export class MinioFileStorage implements FileStorage {
  private readonly internal: S3Client;
  private readonly publicClient: S3Client;
  constructor(private readonly config: ConfigService) {
    const endpoint = `${config.getOrThrow<boolean>('MINIO_USE_SSL') ? 'https' : 'http'}://${config.getOrThrow<string>('MINIO_ENDPOINT')}:${config.getOrThrow<number>('MINIO_PORT')}`;
    const options = {
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY') || 'disabled',
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY') || 'disabled',
      },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
    };
    this.internal = new S3Client({ ...options, endpoint });
    this.publicClient = new S3Client({
      ...options,
      endpoint: config.get<string>('MINIO_PUBLIC_URL') || endpoint,
    });
  }
  async assertAvailable(): Promise<void> {
    const Bucket = this.config.getOrThrow<string>('MINIO_BUCKET');
    if ((await this.internal.send(new GetBucketVersioningCommand({ Bucket }))).Status !== 'Enabled')
      throw new Error('FILE_VERSIONING_REQUIRED');
    try {
      // Upload buckets have no public bucket policy. IAM permissions are provisioned separately.
      const policy = await this.internal.send(new GetBucketPolicyCommand({ Bucket }));
      if (policy.Policy && policy.Policy !== '{}') throw new Error('FILE_PRIVATE_BUCKET_REQUIRED');
    } catch (error: unknown) {
      if (!(error instanceof Error) || error.name !== 'NoSuchBucketPolicy') throw error;
    }
  }
  async presignPut(bucket: string, key: string, mimeType: string, ttl: number): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }),
      {
        expiresIn: ttl,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['content-type']),
      },
    );
  }
  async head(bucket: string, key: string, versionId?: string): Promise<ObjectVersion> {
    const result = await this.internal.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
    );
    if (!result.VersionId || result.VersionId === 'null' || result.ContentLength === undefined)
      throw new Error('FILE_VERSION_REQUIRED');
    return { versionId: result.VersionId, size: result.ContentLength };
  }
  async copy(
    source: StorageLocation,
    destinationKey: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const CopySource = `${source.bucket}/${source.key.split('/').map(encodeURIComponent).join('/')}?versionId=${encodeURIComponent(source.versionId)}`;
    const result = await this.internal.send(
      new CopyObjectCommand({ Bucket: source.bucket, Key: destinationKey, CopySource }),
      { abortSignal: signal },
    );
    if (!result.VersionId || result.VersionId === 'null') throw new Error('FILE_VERSION_REQUIRED');
    return result.VersionId;
  }
  async read(location: StorageLocation, signal?: AbortSignal): Promise<Readable> {
    const result = await this.internal.send(
      new GetObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
        VersionId: location.versionId,
      }),
      { abortSignal: signal },
    );
    if (!(result.Body instanceof Readable)) throw new Error('FILE_STREAM_REQUIRED');
    return result.Body;
  }
  onModuleDestroy(): void {
    this.internal.destroy();
    this.publicClient.destroy();
  }
}
