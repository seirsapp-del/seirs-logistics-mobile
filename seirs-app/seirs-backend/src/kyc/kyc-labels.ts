import { KycOwnerType } from './kyc-document.entity';

/**
 * What each document is called in anything its owner reads.
 *
 * Kept out of the service so a notification, an admin list and an app
 * screen cannot drift into calling the same file three different things.
 * The driver map is carried over verbatim from drivers.service.ts, where
 * it lived as DOC_LABELS.
 */
const DRIVER_LABELS: Record<string, string> = {
  national_id_front: 'Your National ID (front)',
  national_id_back:  'Your National ID (back)',
  drivers_license:   'Your driver licence',
  vehicle_document:  'Your vehicle papers',
  vehicle_photo:     'Your vehicle photo',
  ownership_proof:   'Your proof of ownership',
  insurance_cert:    'Your insurance certificate',
  selfie:            'Your selfie',
  guarantor:         'Your guarantor letter',
  id_document:       'Your identity document',
};

/**
 * The three a partner store uploads when applying.
 *
 * These were columns on partner_stores: storefrontPhotoUrl, cacRegUrl and
 * ownerIdUrl. The ids below are the review store's names for them and the
 * backfill maps the columns onto these exactly.
 */
const PARTNER_LABELS: Record<string, string> = {
  storefront_photo: 'Your storefront photo',
  cac_registration: 'Your CAC registration',
  owner_id:         "The owner's ID",
};

const BUSINESS_LABELS: Record<string, string> = {
  cac_registration: 'Your CAC registration',
  owner_id:         "The owner's ID",
};

const CUSTOMER_LABELS: Record<string, string> = {
  national_id_front: 'Your National ID (front)',
  national_id_back:  'Your National ID (back)',
  id_document:       'Your identity document',
  selfie:            'Your selfie',
};

const BY_OWNER: Record<KycOwnerType, Record<string, string>> = {
  driver:        DRIVER_LABELS,
  partner_store: PARTNER_LABELS,
  business:      BUSINESS_LABELS,
  customer:      CUSTOMER_LABELS,
};

export function docLabel(ownerType: KycOwnerType, docId: string): string {
  return BY_OWNER[ownerType]?.[docId] ?? 'A document';
}

/**
 * Which documents can carry an expiry date.
 *
 * Founder, settled: a CAC registration and an owner's ID both run out in
 * the real world. A storefront photo does not, so the reviewer is never
 * asked for a date on one. Asking for a date that cannot exist is how a
 * form teaches people to enter nonsense.
 *
 * A driver's licence, insurance and vehicle papers expire; a vehicle photo
 * and a selfie do not.
 */
const NON_EXPIRING = new Set([
  'storefront_photo',
  'vehicle_photo',
  'selfie',
]);

export function docCanExpire(docId: string): boolean {
  return !NON_EXPIRING.has(docId);
}

/** The three partner ids, in the order the application collects them. */
export const PARTNER_DOC_IDS = ['storefront_photo', 'cac_registration', 'owner_id'] as const;
