import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

// Cloudflare R2 is S3-compatible — zero egress fees, 10GB free forever.
// API endpoint format: https://<accountId>.r2.cloudflarestorage.com
// Used by: Shopify, Discord, many logistics startups for cost-efficient storage.

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private s3: S3Client | null = null;
  private bucket: string;
  private publicUrl: string;
  private enabled = false;

  constructor(private readonly cfg: ConfigService) {}

  onModuleInit() {
    const accountId  = this.cfg.get<string>('R2_ACCOUNT_ID');
    const accessKey  = this.cfg.get<string>('R2_ACCESS_KEY_ID');
    const secretKey  = this.cfg.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket      = this.cfg.get<string>('R2_BUCKET_NAME', 'seirs-uploads');
    this.publicUrl   = this.cfg.get<string>('R2_PUBLIC_URL', '');

    if (accountId && accessKey && secretKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
      this.enabled = true;
      this.logger.log('Cloudflare R2 storage enabled');
    } else {
      this.logger.warn('R2 credentials not set — file uploads will return placeholder URLs (dev only)');
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    folder: 'kyc' | 'proof' | 'avatars',
  ): Promise<string> {
    if (!this.enabled || !this.s3) {
      // Dev fallback — return a fake URL so the app doesn't crash without R2 set up
      this.logger.warn(`[UPLOAD-DEV] Would upload ${originalName} to R2/${folder}`);
      return `https://placeholder.seirs.co/${folder}/${originalName}`;
    }

    const ext = extname(originalName).toLowerCase();
    const key = `${folder}/${uuidv4()}${ext}`;

    const contentTypeMap: Record<string, string> = {
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
      '.pdf':  'application/pdf',
    };

    await this.s3.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: contentTypeMap[ext] ?? 'application/octet-stream',
    }));

    // Return the public CDN URL (set R2_PUBLIC_URL to your bucket's public domain)
    return `${this.publicUrl}/${key}`;
  }
}
