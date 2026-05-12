/**
 * Business app API barrel.
 * All endpoints live in @seirs/shared/services/api — this file only:
 *   1. Re-exports the shared API surface
 *   2. Maps `authApi` to the business-specific auth endpoints (login,
 *      register, verify-otp) since business uses a different storage key
 *      and different backend routes than customer/driver.
 *
 * Storage key is configured in apps/business-app/app/_layout.tsx via
 * configureSessionStorageKey('seirs_business_user').
 */
export {
  configureApi,
  configureSessionStorageKey,
  onSessionExpired,
  setSessionExpiredHandler,
  uploadApi,
  notificationsApi,
  businessApi,
  partnerApi,
  identityApi,
  feesApi,
  configApi,
  pricingApi,
  usersApi,
} from '@seirs/shared/services/api';

export type {
  ServiceCategory,
  RateCard,
  PriceBreakdown,
  QuoteInput,
} from '@seirs/shared/services/api';

import { businessAuthApi, authApi as sharedAuthApi } from '@seirs/shared/services/api';

/**
 * Business-app authApi — business endpoints for login/register/verify-otp
 * (different routes than customer/driver), shared resendOtp.
 */
export const authApi = {
  login:     businessAuthApi.login,
  register:  businessAuthApi.register,
  verifyOtp: businessAuthApi.verifyOtp,
  resendOtp: sharedAuthApi.resendOtp,
};
