/**
 * Business app API barrel.
 * All endpoints live in @seirs/shared/services/api. this file only:
 *   1. Re-exports the shared API surface
 *   2. Maps `authApi` to the business-specific auth endpoints (login,
 *      register, verify-otp) since business uses a different storage key
 *      and different backend routes than customer/driver.
 *
 * Storage key is configured in apps/business-app/app/_layout.tsx via
 * configureSessionStorageKey('seirs_business_user').
 */
export {
  // request is exported here deliberately (B-3.1): api-keys, api-usage and
  // webhook-log were reaching past this barrel straight into the shared
  // module for it, which is the one guardrail this app has against an
  // import silently resolving to undefined.
  request,
  configureApi,
  configureSessionStorageKey,
  onSessionExpired,
  setSessionExpiredHandler,
  uploadApi,
  storiesApi,
  notificationsApi,
  businessApi,
  partnerApi,
  identityApi,
  userVerificationApi,
  feesApi,
  mapsApi,
  configApi,
  pricingApi,
  usersApi,
  chatApi,
  supportApi,
  sosApi,
  dropoffApi,
  deliveriesApi,
  documentsApi,
  paymentsApi,
} from '@seirs/shared/services/api';

export type {
  ServiceCategory,
  RateCard,
  PriceBreakdown,
  QuoteInput,
  ChatMessageDTO,
  ChatConversationDTO,
  // Chat 5 support toolkit
  SupportTicketDTO,
  SupportThreadDTO,
  TicketTopic,
  TicketStatus,
  UserDocumentDTO,
} from '@seirs/shared/services/api';

import { businessAuthApi, authApi as sharedAuthApi } from '@seirs/shared/services/api';

/**
 * Business-app authApi. business endpoints for login/register/verify-otp
 * (different routes than customer/driver), shared resendOtp.
 */
export const authApi = {
  login:     businessAuthApi.login,
  register:  businessAuthApi.register,
  verifyOtp: businessAuthApi.verifyOtp,
  resendOtp: sharedAuthApi.resendOtp,
  // Password recovery is role-agnostic on the backend: it looks the
  // account up by email and deep-links back to the right app's scheme.
  forgotPassword: sharedAuthApi.forgotPassword,
  resetPassword:  sharedAuthApi.resetPassword,
};
export type { FeaturedCardDTO, StoryDTO } from '@seirs/shared/services/api';
