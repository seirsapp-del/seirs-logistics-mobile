import { randomInt } from 'crypto';
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

// Crockford-style alphabet - no I/L/O/0/1 to avoid visual ambiguity in print/voice
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Crypto-secure random string over the no-lookalike alphabet.
 *
 * 2026-08-09 hardening: replaced Math.random() everywhere. V8's
 * Math.random (xorshift128+) allows full state recovery from a handful
 * of observed outputs, which would let an attacker PREDICT future
 * OTPs, tracking codes, and account IDs. crypto.randomInt draws from
 * the OS CSPRNG: unpredictable by construction. Exported so every
 * code generator in the backend (tracking / drop / backup / stop
 * codes) uses the same primitive.
 */
export function secureCode(length: number, alphabet: string = ID_ALPHABET): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/**
 * Generate a public account identifier - `PREFIX-XXXXXXXX` (8 chars).
 *
 * Uniqueness: the DB unique constraint on users.accountId is the
 * authoritative dedupe layer, and REGISTRATION MUST RETRY on conflict
 * (auth.service does a pre-check + regenerate loop). At full-Nigeria
 * scale (220M users in a 32^8 ≈ 1.1e12 space) the birthday bound
 * predicts ~22k raw collisions across the rollout; the retry loop
 * turns each into an invisible regenerate instead of a failed signup.
 */
export function generateAccountId(prefix: AccountIdPrefixType = AccountIdPrefix.CUSTOMER): string {
  return `${prefix}-` + secureCode(8);
}

/**
 * Generate a 6-digit numeric OTP for email verification, password reset,
 * handoff verification, etc. Crypto-secure (see secureCode note): OTPs
 * were the highest-value target of the Math.random predictability flaw.
 * Per spec: 15-minute expiry enforced by caller.
 */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Generate a UUID-based account ID - used for business/partner where
 * the original implementation already used uuid. Keeping this for parity
 * with existing `BIZ-` records in the DB. uuidv4 is already CSPRNG-based.
 */
export function generateUuidAccountId(prefix: AccountIdPrefixType): string {
  return `${prefix}-` + uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}
