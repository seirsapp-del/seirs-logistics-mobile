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
  userVerificationApi,
  chatApi,
  sosApi,
  offlineSyncApi,
  feesApi,
  earningsApi,
  supportApi,
  documentsApi,
} from '@seirs/shared/services/api';

export type {
  ChatMessageDTO,
  ChatConversationDTO,
  EarningsDashboard,
  DriverEarning,
  // Chat 5 support toolkit
  SupportTicketDTO,
  SupportThreadDTO,
  TicketTopic,
  TicketStatus,
  UserDocumentDTO,
} from '@seirs/shared/services/api';
