import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

type AllowedType = 'image/jpeg' | 'image/png' | 'application/pdf';

const EXT_FOR_TYPE: Record<AllowedType, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'application/pdf': 'pdf',
};

const normaliseExt = (ext: string) =>
  ext.replace(/^\./, '').toLowerCase() === 'jpeg' ? 'jpg' : ext.replace(/^\./, '').toLowerCase();

/**
 * Identify a buffer by its magic bytes. Returns null for anything that
 * is not one of the three formats we accept, which is the whole point:
 * an unrecognised file is rejected rather than stored under whatever
 * type its name claimed.
 */
function sniffType(buf: Buffer): AllowedType | null {
  if (buf.length < 8) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  return null;
}

// Cloudflare R2 is S3-compatible. Zero egress fees, 10GB free forever.
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
      this.logger.warn('R2 credentials not set: file uploads will return placeholder URLs (dev only)');
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    folder: 'kyc' | 'proof' | 'avatars' | 'cms' | 'chat' | 'documents',
  ): Promise<string> {
    if (!this.enabled || !this.s3) {
      // Dev fallback: return a fake URL so the app doesn't crash without R2 set up
      this.logger.warn(`[UPLOAD-DEV] Would upload ${originalName} to R2/${folder}`);
      return `https://placeholder.seirs.co/${folder}/${originalName}`;
    }

    const ext = extname(originalName).toLowerCase();

    /**
     * Check what the bytes actually are (audit 2026-08-14).
     *
     * The only validation was a regex over the filename, in the multer
     * fileFilter. A filename is a caller-supplied string: naming a file
     * .png made it a PNG as far as the API was concerned, and the stored
     * Content-Type was then derived from that same string, so whatever
     * was uploaded got served back under a type it had claimed for
     * itself. These files are later opened by admins reviewing KYC.
     *
     * The same reasoning as the proof-photo rule: enforce where the data
     * is written, not where it is typed.
     */
    const sniffed = sniffType(buffer);
    if (!sniffed) {
      throw new BadRequestException(
        'That file is not a JPEG, PNG or PDF. Check the file and try again.',
      );
    }
    if (EXT_FOR_TYPE[sniffed] !== normaliseExt(ext)) {
      throw new BadRequestException(
        `File contents do not match the .${normaliseExt(ext) || '?'} extension. ` +
        'Rename it to match its real format and try again.',
      );
    }

    // Extension taken from what the bytes say, not from the caller's
    // filename, so the key and the served type cannot disagree.
    const key = `${folder}/${uuidv4()}.${EXT_FOR_TYPE[sniffed]}`;

    await this.s3.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: sniffed,
    }));

    // Return the public CDN URL (set R2_PUBLIC_URL to your bucket's public domain)
    return `${this.publicUrl}/${key}`;
  }

  /**
   * List every object under a prefix. Exists for the CMS media cleanup
   * (founder 2026-08-15: deleting an image from an article removed only the
   * reference, and the file kept occupying R2 space forever). Paginates,
   * since ListObjectsV2 caps at 1000 keys per call.
   */
  async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    if (!this.enabled || !this.s3) return [];
    const out: Array<{ key: string; size: number; lastModified: Date }> = [];
    let token: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({
        Bucket:            this.bucket,
        Prefix:            prefix,
        ContinuationToken: token,
      }));
      for (const o of page.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date() });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  /** Delete objects by key, chunked to the API's 1000-key limit. */
  async deleteKeys(keys: string[]): Promise<number> {
    if (!this.enabled || !this.s3 || keys.length === 0) return 0;
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const res = await this.s3.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true },
      }));
      deleted += chunk.length - (res.Errors?.length ?? 0);
    }
    return deleted;
  }
}
