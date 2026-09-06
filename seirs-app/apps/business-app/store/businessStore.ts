import { create, type StateCreator } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The parts of a partner counter a SENDER needs: where to walk in, when
 * it trades, and how to reach it. Carried in the draft rather than looked
 * up again, so the details survive a reload and the "counter is shut"
 * check keeps working after the nearby list is cleared.
 */
export interface StoreLite {
  id:             string;
  storeName:      string;
  storeAddress:   string;
  phone?:         string | null;
  photoUrl?:      string | null;
  openTime?:      string | null;
  closeTime?:     string | null;
  operatingDays?: string[];
  isOpenNow?:     boolean | null;
  distanceKm?:    number | null;
}

export interface DeliveryStop {
  address:        string;
  // Latitude/longitude: set when the user picks an address from the
  // Google Places autocomplete or taps the map. Required at submit
  // time but optional during entry.
  lat?:           number;
  lng?:           number;
  recipientName:  string;
  recipientPhone: string;
  note?:          string;
  /**
   * Multi-package rebuild (2026-08-16): each stop IS one package with
   * its own identity (founder spec). Photo is REQUIRED at submit;
   * category/weight default from the run-level picks until edited.
   */
  photoUris?:           string[];  // local uris until upload at submit (up to 5, customer parity)
  packageDescription?:  string;
  categoryCode?:        string;
  weightKg?:            number;
  // Customer-parity fields, per package (2026-08-16).
  receiverFirstName?:     string;
  receiverLastName?:      string;
  declaredValueNgn?:      number;
  fallbackPref?:          'hand_only' | 'neighbour' | 'gate' | 'store';
  fallbackNeighbourName?: string;
  /**
   * Destination for THIS package (founder 2026-08-16): a door address or
   * a partner counter near the receiver. Two packages in one run can go
   * to two different stores, so it lives per package.
   */
  destinationMode?:      'address' | 'store';
  destinationStoreId?:   string;
  destinationStoreName?: string;
  /** Full counter record, for the details sheet and the receipt. */
  destinationStoreInfo?: StoreLite | null;
}

export interface DraftDelivery {
  /**
   * How the packages reach SEIRS (founder 2026-08-16): a driver collects
   * from the sender, or the sender drops the run at a partner counter and
   * a driver collects there. Store mode puts the counter's address and
   * coords into the pickup fields, so pricing and routing are unchanged.
   */
  pickupMode?:      'door' | 'store';
  pickupStoreId?:   string;
  pickupStoreName?: string;
  /**
   * Full record of the counter the sender drops at, copied in at
   * selection time so hours and address survive a reload and the
   * "counter is shut" guard does not depend on a transient list.
   */
  pickupStoreInfo?: StoreLite | null;
  pickupAddress:    string;
  pickupLat?:       number;
  pickupLng?:       number;
  stops:            DeliveryStop[];

  // Step 0: what they're sending. categoryCode references
  // ServiceCategory.code from the backend catalog (documents, fragile,
  // bulk_goods, etc.). vehicleType is auto-suggested from category +
  // weight but user-overrideable. weightKg is required at submit.
  categoryCode?:    string;
  weightKg?:        number;
  quantity:         number;          // default 1
  vehicleType:      string;          // motorcycle | car | van | ... | truck_large
  packageDescription?: string;       // optional free text

  // Step 2: schedule.
  scheduledAt?:     string;          // ISO datetime; absent = ASAP
  isRecurring:      boolean;
  recurringPattern: 'daily' | 'weekly' | 'monthly' | null;

  // Auto-optimize toggle for the route. Default ON: Google Directions
  // reorders waypoints for shortest total drive time and we ship the
  // result to the backend so the driver visits in optimal sequence.
  autoOptimizeRoute: boolean;

  // Persisted at submit time so the backend can reconstruct what the
  // user actually saw on the booking screen.
  optimizedWaypointOrder?: number[] | null;
  routeWasAutoOptimized?:  boolean;
}

interface BusinessStore {
  draft:       DraftDelivery;
  /**
   * When the draft was last touched, or null when it is the empty form.
   * Send reads it to say "unfinished booking from 20 minutes ago" and
   * the store drops a draft nobody has touched for a day.
   */
  draftSavedAt: number | null;
  setDraft:    (patch: Partial<DraftDelivery>) => void;
  resetDraft:  () => void;
  addStop:     (stop: DeliveryStop) => void;
  removeStop:  (idx: number) => void;
  updateStop:  (idx: number, patch: Partial<DeliveryStop>) => void;
  /** Replace the entire stops array, used after auto-optimize reorders. */
  reorderStops: (newOrder: DeliveryStop[]) => void;
}

/** A saved draft older than this is thrown away on the next app start. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * True when the form holds nothing a sender typed: no pickup, no
 * address, no recipient, no photo, no weight on any package. The
 * vehicle and the schedule toggles do not count; they are defaults.
 */
export function isDraftEmpty(d: DraftDelivery): boolean {
  if (d.pickupAddress?.trim()) return false;
  if (d.pickupStoreId) return false;
  if (d.packageDescription?.trim()) return false;
  if (d.stops.length > 1) return false;
  const s = d.stops[0];
  if (!s) return true;
  return !(
    s.address?.trim() || s.recipientName?.trim() || s.recipientPhone?.trim() ||
    s.receiverFirstName?.trim() || s.receiverLastName?.trim() ||
    s.packageDescription?.trim() || s.note?.trim() ||
    (s.photoUris?.length ?? 0) > 0 || s.weightKg || s.categoryCode ||
    s.declaredValueNgn || s.destinationStoreId
  );
}

const EMPTY_DRAFT: DraftDelivery = {
  pickupAddress:     '',
  stops:             [{ address: '', recipientName: '', recipientPhone: '' }],
  categoryCode:      undefined,
  weightKg:          undefined,
  quantity:          1,
  vehicleType:       'motorcycle',
  packageDescription: undefined,
  scheduledAt:       undefined,
  isRecurring:       false,
  recurringPattern:  null,
  autoOptimizeRoute: true,
  optimizedWaypointOrder: null,
  routeWasAutoOptimized:  false,
};

const createBusinessStore: StateCreator<BusinessStore> = (set) => ({
  draft:        EMPTY_DRAFT,
  draftSavedAt: null,
  setDraft:   (patch) => set((s) => ({ draft: { ...s.draft, ...patch }, draftSavedAt: Date.now() })),
  resetDraft: () => set({ draft: EMPTY_DRAFT, draftSavedAt: null }),
  addStop:    (stop) => set((s) => ({ draft: { ...s.draft, stops: [...s.draft.stops, stop] }, draftSavedAt: Date.now() })),
  removeStop: (idx) =>
    set((s) => ({ draft: { ...s.draft, stops: s.draft.stops.filter((_, i) => i !== idx) }, draftSavedAt: Date.now() })),
  updateStop: (idx, patch) =>
    set((s) => ({
      draft: {
        ...s.draft,
        stops: s.draft.stops.map((stop, i) => i === idx ? { ...stop, ...patch } : stop),
      },
      draftSavedAt: Date.now(),
    })),
  reorderStops: (newOrder) =>
    set((s) => ({ draft: { ...s.draft, stops: newOrder }, draftSavedAt: Date.now() })),
});

/**
 * The draft is persisted (founder 2026-08-16): a business part-way
 * through ten packages must not lose them to an app restart, and photos
 * picked minutes ago should still be attached. Only the draft is stored;
 * nothing else in this store is worth surviving a restart.
 *
 * And it EXPIRES (founder 2026-09-06: "imagine a user having to delete
 * their old input"). Surviving a restart ten minutes later is the
 * feature; greeting somebody a week later with a stranger's lasagne
 * photo on "Two cartons of shoes" is not. A draft untouched for a day is
 * dropped here, before the form ever renders it, and Send offers "Start
 * fresh" for anything younger than that.
 */
export const useBusinessStore = create<BusinessStore>()(
  persist(createBusinessStore, {
    name: 'seirs_business_draft',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ((state: BusinessStore) => ({ draft: state.draft, draftSavedAt: state.draftSavedAt })) as any,
    onRehydrateStorage: () => (state) => {
      if (!state) return;
      const stale = state.draftSavedAt != null && Date.now() - state.draftSavedAt > DRAFT_TTL_MS;
      // Drafts saved before the stamp existed carry no date: treat them
      // as stale too, otherwise every phone keeps its pre-2026-09-06
      // leftovers forever.
      const undated = state.draftSavedAt == null && !isDraftEmpty(state.draft);
      if (stale || undated) state.resetDraft();
    },
  }),
);

