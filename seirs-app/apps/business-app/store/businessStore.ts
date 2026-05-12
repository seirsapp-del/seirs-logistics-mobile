import { create } from 'zustand';

export interface DeliveryStop {
  address:        string;
  // Latitude/longitude — set when the user picks an address from the
  // Google Places autocomplete or taps the map. Required at submit
  // time but optional during entry.
  lat?:           number;
  lng?:           number;
  recipientName:  string;
  recipientPhone: string;
  note?:          string;
}

export interface DraftDelivery {
  pickupAddress:    string;
  pickupLat?:       number;
  pickupLng?:       number;
  stops:            DeliveryStop[];

  // Step 0 — what they're sending. categoryCode references
  // ServiceCategory.code from the backend catalog (documents, fragile,
  // bulk_goods, etc.). vehicleType is auto-suggested from category +
  // weight but user-overrideable. weightKg is required at submit.
  categoryCode?:    string;
  weightKg?:        number;
  quantity:         number;          // default 1
  vehicleType:      string;          // motorcycle | car | van | ... | truck_large
  packageDescription?: string;       // optional free text

  // Step 2 — schedule.
  scheduledAt?:     string;          // ISO datetime; absent = ASAP
  isRecurring:      boolean;
  recurringPattern: 'daily' | 'weekly' | 'monthly' | null;

  // Auto-optimize toggle for the route. Default ON — Google Directions
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
  /** Replace the entire stops array — used after auto-optimize reorders. */
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

export const useBusinessStore = create<BusinessStore>((set) => ({
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
}));
