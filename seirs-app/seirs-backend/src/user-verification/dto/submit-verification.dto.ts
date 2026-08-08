import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export const DOC_TYPES = ['nin', 'drivers_licence', 'passport', 'pvc'] as const;

/**
 * Payload for POST /users/me/identity-verification.
 *
 * documentPhotoUrl and selfiePhotoUrl must be R2 URLs from the upload
 * service. the app uploads first, then submits URLs here. We don't
 * accept raw base64 to keep this endpoint cheap and to force the upload
 * flow through the (moderatable) upload service.
 */
export class SubmitIdentityDto {
  @IsIn(DOC_TYPES as unknown as string[], {
    message: 'documentType must be one of: nin, drivers_licence, passport, pvc',
  })
  documentType!: (typeof DOC_TYPES)[number];

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  documentPhotoUrl!: string;

  // Back-of-ID photo (front + back both required as of 2026-08-08)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  documentBackPhotoUrl!: string;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  selfiePhotoUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  submitterNote?: string;
}
