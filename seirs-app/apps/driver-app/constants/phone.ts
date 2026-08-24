// Single source of truth for Nigerian mobile validation in the driver app.
//
// D-10.7: registration validated against a fixed prefix list
// (070|071|080|081|090|091) while edit-profile accepted any 0[789], so a
// network code the NCC issues tomorrow was editable but not registerable.
// Both screens now share the structural rule: 11 digits, 0 + [789] + 9.
//
// D-10.3: registration also validated a normalised copy but posted the raw
// field, so "+2348012345678" was stored as "+234+2348012345678". toE164Ng is
// the only thing that should ever build the wire value.

// Accepts the shapes a driver actually types: 08012345678, +2348012345678,
// 2348012345678, 8012345678, with spaces or hyphens anywhere.
export function normalisePhoneNg(raw: string): string {
  const cleaned = (raw ?? '').replace(/[\s()\-]/g, '').replace(/^\+?234/, '');
  // Bare national number (no leading 0) is common when a +234 prefix is stripped.
  return /^[789]\d{9}$/.test(cleaned) ? `0${cleaned}` : cleaned;
}

export const NG_MOBILE_RE = /^0[789]\d{9}$/;

export function isValidNigerianMobile(raw: string): boolean {
  return NG_MOBILE_RE.test(normalisePhoneNg(raw));
}

// E.164 for the API. Never send the raw field.
export function toE164Ng(raw: string): string {
  return `+234${normalisePhoneNg(raw).replace(/^0/, '')}`;
}

export const NG_MOBILE_HINT =
  'Enter a valid Nigerian mobile number (e.g. 08012345678: 11 digits; +234 prefix also accepted).';
