// Re-export only. The implementation moved to shared/utils/ngPhone.ts on
// 2026-09-01 so customer and business stop carrying their own fixed prefix
// lists. Driver's imports are unchanged.
export {
  normalisePhoneNg,
  NG_MOBILE_RE,
  isValidNigerianMobile,
  toE164Ng,
  toNationalInput,
  isValidNationalNg,
  NG_MOBILE_HINT,
  NG_PHONE_HINT,
} from '@seirs/shared/utils/ngPhone';
