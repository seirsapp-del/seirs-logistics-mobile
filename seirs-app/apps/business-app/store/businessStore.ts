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
  setDraft:    (patch: Partial<DraftDelivery>) => void;
  resetDraft:  () => void;
  addStop:     (stop: DeliveryStop) => void;
  removeStop:  (idx: number) => void;
  updateStop:  (idx: number, patch: Partial<DeliveryStop>) => void;
  /** Replace the entire stops array, used after auto-optimize reorders. */
  reorderStops: (newOrder: DeliveryStop[]) => void;
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
  draft:      EMPTY_DRAFT,
  setDraft:   (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  resetDraft: () => set({ draft: EMPTY_DRAFT }),
  addStop:    (stop) => set((s) => ({ draft: { ...s.draft, stops: [...s.draft.stops, stop] } })),
  removeStop: (idx) =>
    set((s) => ({ draft: { ...s.draft, stops: s.draft.stops.filter((_, i) => i !== idx) } })),
  updateStop: (idx, patch) =>
    set((s) => ({
      draft: {
        ...s.draft,
        stops: s.draft.stops.map((stop, i) => i === idx ? { ...stop, ...patch } : stop),
      },
    })),
  reorderStops: (newOrder) =>
    set((s) => ({ draft: { ...s.draft, stops: newOrder } })),
});

/**
 * The draft is persisted (founder 2026-08-16): a business part-way
 * through ten packages must not lose them to an app restart, and photos
 * picked minutes ago should still be attached. Only the draft is stored;
 * nothing else in this store is worth surviving a restart.
 */
export const useBusinessStore = create<BusinessStore>()(
  persist(createBusinessStore, {
    name: 'seirs_business_draft',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ((state: BusinessStore) => ({ draft: state.draft })) as any,
  }),
);

