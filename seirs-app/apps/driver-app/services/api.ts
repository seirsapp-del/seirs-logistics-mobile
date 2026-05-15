export {
  configureApi,
  onSessionExpired,
  setSessionExpiredHandler,
  uploadApi,
  authApi,
  usersApi,
  deliveriesApi,
  paymentsApi,
  driversApi,
  notificationsApi,
  identityApi,
  chatApi,
  sosApi,
  offlineSyncApi,
  feesApi,
  earningsApi,
} from '@seirs/shared/services/api';

export type {
  ChatMessageDTO,
  ChatConversationDTO,
  EarningsDashboard,
  DriverEarning,
} from '@seirs/shared/services/api';
