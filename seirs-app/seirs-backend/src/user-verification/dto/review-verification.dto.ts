import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload for POST /admin/identity-verifications/:id/reject.
 * `reason` is shown to the user, so it needs to be specific enough that
 * they know what to fix. `adminNote` is internal (kept for audit).
 */
export class RejectIdentityDto {
  @IsString()
  @MinLength(6, { message: 'Rejection reason must be at least 6 characters (users need to know what to fix)' })
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}

export class ApproveIdentityDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNote?: string;
}
