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
  // Whitelisted deliberately: a name missing from this barrel resolves to
  // undefined at runtime and the screen red-screens rather than failing at
  // compile time.
  statementsApi,
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
  configApi,
  // Raw request helper. The SOS screen reads GET /config/emergency-contacts,
  // an admin-managed list with no typed wrapper in shared yet. Exported here
  // so the screen does not hand-roll a fetch and lose the auth header and the
  // 401 session handling. This barrel is a whitelist: an export missing from
  // it resolves to undefined at runtime and red-screens the app.
  request as apiRequest,
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
