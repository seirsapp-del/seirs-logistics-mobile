/**
 * CAC registration numbers.
 *
 * The field is optional (plenty of real Nigerian traders are not registered,
 * and signup must not turn them away), but the founder's point on 2026-09-01
 * stands: optional is not the same as "type anything". It was free text on
 * the signup form, free text on the profile screen, and unvalidated on the
 * server, so "n/a", "will send later" and a phone number were all storable
 * in a field that ends up on invoices.
 *
 * What the CAC actually issues:
 *   RC######   companies (limited liability)
 *   BN#######  registered business names (sole traders, enterprises)
 *   IT######   incorporated trustees (NGOs, associations)
 *
 * The prefix is optional here because most people write only the digits, and
 * the digit count is deliberately loose (4 to 8): older companies carry short
 * numbers and newer registrations are longer, so a tight rule would reject
 * real businesses. This catches nonsense, not edge cases.
 */

/** Strips the separators people type and uppercases the prefix. */
export function normaliseRc(raw: string): string {
  return (raw ?? '').replace(/[\s\-\/.]/g, '').toUpperCase();
}

export const RC_RE = /^(RC|BN|IT)?\d{4,8}$/;

/** Empty is valid: the field is optional. Anything present must look real. */
export function isValidRc(raw: string): boolean {
  const v = normaliseRc(raw);
  return v === '' || RC_RE.test(v);
}

export const RC_HINT =
  'Your CAC number, if you have one. RC, BN or IT followed by the digits.';

export const RC_ERROR =
  'That does not look like a CAC number. Use RC, BN or IT followed by 4 to 8 digits, for example RC123456. Leave it blank if you are not registered.';
