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
  mapsApi,
  earningsApi,
  supportApi,
  documentsApi,
  dropoffApi,
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
  // Vehicle ownership + self-serve vehicle change (2026-08-25). These must
  // be listed here or the import resolves to undefined at runtime: this
  // barrel is a whitelist, not a re-export of everything.
  OwnerRelationship,
  VehicleOwnershipInput,
  VehicleChangeRequest,
  VehicleChangeDTO,
  VehicleRecordDTO,
} from '@seirs/shared/services/api';
