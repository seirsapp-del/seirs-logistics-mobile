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
 *   RC-######   companies (limited liability)
 *   BN-#######  registered business names (sole traders, enterprises)
 *   IT-######   incorporated trustees (NGOs, associations)
 *
 * The hyphen stays. The first version of this stripped it, which the founder
 * caught the same day: people write and read these numbers WITH the hyphen,
 * so canonicalising to "RC123456" made a familiar number look wrong on an
 * invoice. It is optional on input (both "RC 123456" and "RC123456" are
 * accepted) and put back on the way out.
 *
 * The prefix is optional because most people type only the digits, and the
 * digit count is deliberately loose (4 to 8): older companies carry short
 * numbers and newer registrations are longer, so a tight rule would reject
 * real businesses. This catches nonsense, not edge cases.
 */

/**
 * What to keep as the user types: letters, digits and the hyphen, uppercased.
 * Everything else is dropped, which is also why nothing exotic can reach the
 * database through this field.
 */
export function normaliseRc(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

export const RC_RE = /^(RC|BN|IT)?-?\d{4,8}$/;

/** Empty is valid: the field is optional. Anything present must look real. */
export function isValidRc(raw: string): boolean {
  const v = normaliseRc(raw);
  return v === '' || RC_RE.test(v);
}

/** The stored form: prefix, hyphen, digits. Bare digits stay bare. */
export function canonicalRc(raw: string): string {
  const v = normaliseRc(raw);
  if (v === '') return '';
  const m = v.match(/^(RC|BN|IT)?-?(\d{4,8})$/);
  if (!m) return v;
  return m[1] ? `${m[1]}-${m[2]}` : m[2];
}

export const RC_HINT =
  'Your CAC number, if you have one. RC, BN or IT followed by the digits.';

export const RC_ERROR =
  'That does not look like a CAC number. Use RC, BN or IT followed by 4 to 8 digits, for example RC-123456. Leave it blank if you are not registered.';
