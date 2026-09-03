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
 * A document, and everything policy says about it.
 *
 * Grouped by WHAT THE DOCUMENT IS ABOUT, which is the idea taken from the
 * driver app on 2026-09-03. A rider's NIN is asked once and never again,
 * because it does not change when they buy a new okada; the vehicle
 * proofs are asked again at every vehicle change. Partner documents had
 * no such split: a person, a company and a place sat in one flat list
 * with one lifetime between them.
 *
 * `required` lives here rather than in the database because it is a fact
 * about the KIND of document, not about any row. A store that has not
 * sent its storage photo has no row to hold the flag.
 */
export type KycDocGroup = 'owner' | 'business' | 'premises' | 'trust';

export interface KycDocSpec {
  docId:    string;
  label:    string;
  group:    KycDocGroup;
  required: boolean;
  /** Whether a reviewer may put an expiry date on it. */
  canExpire: boolean;
  /**
   * What makes us ask for it again. 'never' is the person and the
   * company; 'premises_move' is anything that photographs the shop, and
   * a shop that moves is a different shop for our purposes.
   */
  reaskOn: 'never' | 'premises_move';
  /** Shown under the label in the app, in the owner's own terms. */
  hint: string;
  /**
   * Whether the file must carry the coordinates it was taken at.
   *
   * Only the premises photographs. A CAC certificate is photographed at a
   * kitchen table and that tells us nothing; a storefront photograph
   * taken 40km from the address it claims is the cheapest fraud signal
   * available to us.
   */
  needsLocation: boolean;
}

/**
 * A partner store's documents (founder-approved 2026-09-03).
 *
 * Deliberately NOT asking for a tenancy agreement or a utility bill. A
 * Lagos counter shop often has neither, and requiring one excludes
 * exactly the supply the counter model depends on. The on-site
 * coordinate does that job instead.
 */
export const PARTNER_DOC_SPEC: KycDocSpec[] = [
  // ── The owner. Asked once, never again. ──
  {
    docId: 'owner_id_front', label: "The owner's ID (front)", group: 'owner',
    required: true, canExpire: true, reaskOn: 'never', needsLocation: false,
    hint: 'Government ID or NIN slip, front side',
  },
  {
    docId: 'owner_id_back', label: "The owner's ID (back)", group: 'owner',
    required: true, canExpire: true, reaskOn: 'never', needsLocation: false,
    hint: 'The back of the same ID or NIN slip',
  },
  {
    // We hold an ID with a photograph on it and, until now, nothing to
    // compare that photograph against.
    docId: 'owner_selfie', label: 'A photo of the owner', group: 'owner',
    required: true, canExpire: false, reaskOn: 'never', needsLocation: false,
    hint: 'A clear photo of your face, so we can match it to the ID',
  },
  {
    // A rider holds a parcel for an hour and we ask for a guarantor. A
    // shop holds it on a shelf overnight (founder, 2026-09-03).
    docId: 'guarantor', label: 'Guarantor letter', group: 'trust',
    required: false, canExpire: false, reaskOn: 'never', needsLocation: false,
    hint: 'A letter from somebody who vouches for you. Recommended, not required',
  },

  // ── The business. Optional, and raises trust rather than granting it. ──
  {
    // Stays optional deliberately: most Nigerian counter shops are not
    // registered, and requiring CAC would exclude the majority of supply.
    docId: 'cac_registration', label: 'CAC registration', group: 'business',
    required: false, canExpire: true, reaskOn: 'never', needsLocation: false,
    hint: 'Only if the shop is registered. Not required',
  },
  {
    docId: 'tin_certificate', label: 'Tax identification (TIN)', group: 'business',
    required: false, canExpire: false, reaskOn: 'never', needsLocation: false,
    hint: 'Only meaningful if you have a CAC registration. Not required',
  },

  // ── The premises. Asked again if the shop moves. ──
  {
    docId: 'storefront_photo', label: 'The shop front', group: 'premises',
    required: true, canExpire: false, reaskOn: 'premises_move', needsLocation: true,
    hint: 'The front of the shop, with your sign visible. Taken at the shop',
  },
  {
    // The one that matters. A shop can have a beautiful front and
    // nowhere to put anything.
    docId: 'storage_area', label: 'Where parcels will sit', group: 'premises',
    required: true, canExpire: false, reaskOn: 'premises_move', needsLocation: true,
    hint: 'The actual space parcels will be kept in. Taken at the shop',
  },
  {
    // Optional on purpose: in a small kiosk this IS the storage area, and
    // forcing it would make somebody photograph the same shelf twice.
    docId: 'shelf_or_lockup', label: 'The shelf or lock-up', group: 'premises',
    required: false, canExpire: false, reaskOn: 'premises_move', needsLocation: true,
    hint: 'The specific shelf, cupboard or room, with something in shot for size',
  },
  {
    docId: 'street_view', label: 'The shop from the road', group: 'premises',
    required: true, canExpire: false, reaskOn: 'premises_move', needsLocation: true,
    hint: 'Stand across the road so we can see the sign and the neighbours',
  },
];

const PARTNER_LABELS: Record<string, string> =
  Object.fromEntries(PARTNER_DOC_SPEC.map(d => [d.docId, d.label]));

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

/**
 * The id every partner store used before 2026-09-03, kept so a document
 * uploaded under the old name still finds its label rather than falling
 * through to "A document". The migration renames the rows; this covers
 * anything that slipped past it.
 */
const PARTNER_LEGACY_LABELS: Record<string, string> = {
  owner_id: "The owner's ID",
};

export function docLabel(ownerType: KycOwnerType, docId: string): string {
  return BY_OWNER[ownerType]?.[docId]
    ?? (ownerType === 'partner_store' ? PARTNER_LEGACY_LABELS[docId] : undefined)
    ?? 'A document';
}

/**
 * Which documents can carry an expiry date.
 *
 * Founder, settled: a CAC registration and an owner's ID both run out in
 * the real world. A storefront photo does not, so the reviewer is never
 * asked for a date on one. Asking for a date that cannot exist is how a
 * form teaches people to enter nonsense.
 *
 * A driver's licence, insurance and vehicle papers expire; a vehicle
 * photo and a selfie do not.
 */
const NON_EXPIRING = new Set([
  'storefront_photo',
  'storage_area',
  'shelf_or_lockup',
  'street_view',
  'vehicle_photo',
  'selfie',
  'owner_selfie',
  'guarantor',
  'tin_certificate',
]);

export function docCanExpire(docId: string): boolean {
  return !NON_EXPIRING.has(docId);
}

/** Every partner document id, in the order the application collects them. */
export const PARTNER_DOC_IDS = PARTNER_DOC_SPEC.map(d => d.docId);

/** The ones an application cannot be submitted without. */
export const PARTNER_REQUIRED_DOC_IDS =
  PARTNER_DOC_SPEC.filter(d => d.required).map(d => d.docId);

/** The ones whose file must arrive with the coordinates it was taken at. */
export const PARTNER_LOCATED_DOC_IDS =
  PARTNER_DOC_SPEC.filter(d => d.needsLocation).map(d => d.docId);

export function partnerDocSpec(docId: string): KycDocSpec | undefined {
  return PARTNER_DOC_SPEC.find(d => d.docId === docId);
}
