// CAC numbers: RC/BN/IT plus 4-8 digits, prefix optional because most people
// type only the digits. Optional field, so blank passes. Mirrors
// shared/utils/rcNumber.ts on the clients; validated here too because the
// business register endpoint takes `body: any` and skips the DTO pipe
// entirely, so a client gate is the only thing standing there otherwise.
const RC_RE = /^(RC|BN|IT)?-?\d{4,8}$/;
export function normaliseRcNumber(raw?: string | null): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

/** Stored form: prefix, hyphen, digits. The hyphen is how people read these. */
export function canonicalRcNumber(raw?: string | null): string {
  const v = normaliseRcNumber(raw);
  if (v === '') return '';
  const m = v.match(/^(RC|BN|IT)?-?(\d{4,8})$/);
  if (!m) return v;
  return m[1] ? `${m[1]}-${m[2]}` : m[2];
}
export function isValidRcNumber(raw?: string | null): boolean {
  const v = normaliseRcNumber(raw);
  return v === '' || RC_RE.test(v);
}
export const RC_NUMBER_ERROR =
  'That does not look like a CAC number. Use RC, BN or IT followed by 4 to 8 digits, for example RC-123456. Leave it blank if you are not registered.';
