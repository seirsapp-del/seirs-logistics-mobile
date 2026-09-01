/**
 * Nigerian mobile numbers: one implementation for all three apps.
 *
 * Promoted out of apps/driver-app/constants/phone.ts on 2026-09-01. Driver
 * had the only correct version; customer and business each carried their own
 * fixed prefix list (070|071|080|081|090|091), which means a network code the
 * NCC issues tomorrow cannot be registered. The structural rule is what
 * matters: 0 + [789] + 9 digits.
 *
 * The founder's point, 2026-09-01: a field showing "+234" should be followed
 * by the number WITHOUT its leading zero, but plenty of people will type the
 * whole thing the way it is written on their SIM pack. So nothing is
 * rejected for shape. Whatever is typed is corrected as it is typed.
 *
 *   typed              shown after +234     sent
 *   08012345678        8012345678           +2348012345678
 *   8012345678         8012345678           +2348012345678
 *   +234 801 234 5678  8012345678           +2348012345678
 *   0803-123-4567(8)   8031234567(8)        +2348031234567(8)
 */

/** Accepts every shape a person actually types, returns the 0-prefixed form. */
export function normalisePhoneNg(raw: string): string {
  const cleaned = (raw ?? '').replace(/[\s()\-]/g, '').replace(/^\+?234/, '');
  // A bare national number (no leading 0) is what you get once +234 is stripped.
  return /^[789]\d{9}$/.test(cleaned) ? `0${cleaned}` : cleaned;
}

export const NG_MOBILE_RE = /^0[789]\d{9}$/;

export function isValidNigerianMobile(raw: string): boolean {
  return NG_MOBILE_RE.test(normalisePhoneNg(raw));
}

/** E.164 for the API. Never send the raw field. */
export function toE164Ng(raw: string): string {
  return `+234${normalisePhoneNg(raw).replace(/^0/, '')}`;
}

/**
 * What to display in an input that already renders its own "+234" prefix.
 *
 * Digits only, no country code, no leading zero, capped at 10. Feed this
 * straight back through onChangeText so the correction happens under the
 * user's cursor rather than being sprung on them at submit time. Someone who
 * types the leading 0 out of habit simply watches it not appear, which is a
 * quieter lesson than an error message.
 */
export function toNationalInput(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) d = d.slice(3);
  if (d.startsWith('0'))   d = d.slice(1);
  return d.slice(0, 10);
}

/** Validates the 10-digit national number produced by toNationalInput. */
export function isValidNationalNg(national: string): boolean {
  return /^[789]\d{9}$/.test(national);
}

export const NG_MOBILE_HINT =
  'Enter a valid Nigerian mobile number (e.g. 08012345678: 11 digits; +234 prefix also accepted).';

/** Hint for a field that already shows +234, so the 0 is not wanted. */
export const NG_PHONE_HINT =
  '10 digits after +234. Type it with or without the leading 0, we will sort it out.';
