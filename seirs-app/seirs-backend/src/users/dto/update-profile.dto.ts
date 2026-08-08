import {
  IsOptional, IsString, Length, Matches, IsUrl, IsDateString, IsObject, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Validation for PATCH /users/me.
 *
 * Rules deliberately conservative to prevent impersonation, offensive
 * display names, and phone-number-in-name spam that we saw ridesharing
 * apps get hit with at launch.
 *
 * If you loosen these rules later, also loosen the corresponding
 * frontend validation in apps/customer-app/app/(customer)/edit-profile.tsx.
 */

// Regex shared by all name-shaped fields. Allows Unicode letters (Yoruba /
// Hausa / Igbo diacritics), spaces, hyphens, apostrophes, dots. Must start
// with a letter and end with a letter or dot.
const NAME_CHARS = /^[\p{L}][\p{L} .'\-]*[\p{L}.]$/u;
// Blocks phone-in-name (3+ consecutive digits), URLs, emails,
// and multiple consecutive spaces.
const NAME_NO_SPAM = /^(?!.*\d{3,})(?!.*\s{2,})(?!.*(?:https?:|www\.|\.com|\.ng|\.co|@))/i;
const NAME_CHARS_MSG   = 'Only letters, spaces, hyphens, apostrophes and dots allowed';
const NAME_NO_SPAM_MSG = 'No phone numbers, URLs, or email addresses';

class HomeAddressDto {
  @IsString() @Length(1, 40)
  label!: string;

  @IsString() @Length(2, 200)
  street!: string;

  @IsString() @Length(2, 80)
  city!: string;

  @IsString() @Length(2, 80)
  state!: string;

  @IsOptional()
  @IsObject()
  coords?: { lat: number; lng: number } | null;
}

export class UpdateProfileDto {
  // ── Legacy full-name (kept for backwards-compat). New writes should
  //    prefer firstName + lastName; the service auto-composes `name`
  //    when those are set. Accepting `name` here so old clients still work.
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'Name must be 2–120 characters' })
  @Matches(NAME_CHARS, { message: NAME_CHARS_MSG })
  @Matches(NAME_NO_SPAM, { message: NAME_NO_SPAM_MSG })
  name?: string;

  // ── Split-name fields (2026-08-08 rollout)
  @IsOptional()
  @IsString()
  @Length(2, 40, { message: 'First name must be 2–40 characters' })
  @Matches(NAME_CHARS, { message: NAME_CHARS_MSG })
  @Matches(NAME_NO_SPAM, { message: NAME_NO_SPAM_MSG })
  firstName?: string;

  // Middle name is optional. many Nigerian users skip it, some have
  // multiple. Length allows longer since it may contain "bin", "de", etc.
  @IsOptional()
  @IsString()
  @Length(1, 40, { message: 'Middle name must be 1–40 characters' })
  @Matches(NAME_CHARS, { message: NAME_CHARS_MSG })
  @Matches(NAME_NO_SPAM, { message: NAME_NO_SPAM_MSG })
  middleName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 40, { message: 'Last name must be 2–40 characters' })
  @Matches(NAME_CHARS, { message: NAME_CHARS_MSG })
  @Matches(NAME_NO_SPAM, { message: NAME_NO_SPAM_MSG })
  lastName?: string;

  // ── Date of birth. ISO date only (no time). Age gate enforced in
  //    the service layer: must be 13–120 years old.
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Date of birth must be a valid date (YYYY-MM-DD)' })
  dateOfBirth?: string;

  // ── Phone. Nigerian mobile only.
  @IsOptional()
  @IsString()
  @Matches(/^(\+?234[789]\d{9}|0[789]\d{9}|[789]\d{9})$/, {
    message: 'Phone must be a valid Nigerian mobile number',
  })
  phone?: string;

  // ── Profile photo (https URL from upload service)
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] }, {
    message: 'Profile photo must be a valid https URL',
  })
  profilePhoto?: string;

  // ── Emergency contact. no cool-down, safety trumps friction
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Emergency contact name must be 2–100 characters' })
  @Matches(NAME_CHARS, { message: NAME_CHARS_MSG })
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+?234[789]\d{9}|0[789]\d{9}|[789]\d{9})$/, {
    message: 'Emergency contact phone must be a valid Nigerian mobile number',
  })
  emergencyContactPhone?: string;

  // ── Home address. nested object
  @IsOptional()
  @ValidateNested()
  @Type(() => HomeAddressDto)
  homeAddress?: HomeAddressDto;
}
