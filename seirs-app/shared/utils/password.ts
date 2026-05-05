// Shared password policy for SEIRS apps.
//
// Standard for end-user accounts (customer / driver / business / partner-store):
//   - Minimum 8 characters
//   - At least one uppercase letter
//   - At least one lowercase letter
//   - At least one number
//   - At least one special character
//
// Admin accounts use a stricter 12-char rule (enforced separately in the
// admin dashboard, not via this util).
//
// Source of truth — used by every signup, password-reset, and change-password
// screen across all 3 mobile apps and by the backend's RegisterDto. If you
// change the rule here, frontend and backend stay in sync automatically.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HELP_TEXT =
  'At least 8 characters with uppercase, lowercase, a number, and a symbol.';

// Matches a password with at least one lowercase, one uppercase, one digit,
// one special character, and length >= 8. Symbol class deliberately wide —
// includes everything most keyboards produce.
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;

/**
 * Validate a password against the SEIRS standard. Returns an error message
 * suitable for showing in a form, or `null` if the password passes.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/\d/.test(password))    return 'Add at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'Add at least one symbol (e.g. ! @ # $ % &).';
  }
  return null;
}

/** Same rule expressed as a boolean — handy for disabling submit buttons. */
export function isPasswordValid(password: string): boolean {
  return validatePassword(password) === null;
}
