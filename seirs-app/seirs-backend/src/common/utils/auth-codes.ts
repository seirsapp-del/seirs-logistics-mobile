import { v4 as uuidv4 } from 'uuid';

/**
 * Account ID prefixes per Master Spec V7.
 * §1.3 (customer), §2.1 (driver), §3.1 (admin), §4.2 (business), §4.3 (partner).
 */
export const AccountIdPrefix = {
  CUSTOMER: 'CUST',
  DRIVER:   'DRV',
  ADMIN:    'ADM',
  BUSINESS: 'BIZ',
  PARTNER:  'PART',
} as const;

export type AccountIdPrefixType = typeof AccountIdPrefix[keyof typeof AccountIdPrefix];

// Crockford-style alphabet — no I/L/O/0/1 to avoid visual ambiguity in print/voice
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a public account identifier — `PREFIX-XXXXXXXX` (8 chars).
 * Collision risk is negligible for our scale, but DB unique constraint
 * is the authoritative dedupe layer.
 */
export function generateAccountId(prefix: AccountIdPrefixType = AccountIdPrefix.CUSTOMER): string {
  let id = `${prefix}-`;
  for (let i = 0; i < 8; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

/**
 * Generate a 6-digit numeric OTP for email verification, password reset, etc.
 * Per spec: 15-minute expiry enforced by caller.
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a UUID-based account ID — used for business/partner where
 * the original implementation already used uuid. Keeping this for parity
 * with existing `BIZ-` records in the DB.
 */
export function generateUuidAccountId(prefix: AccountIdPrefixType): string {
  return `${prefix}-` + uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}
