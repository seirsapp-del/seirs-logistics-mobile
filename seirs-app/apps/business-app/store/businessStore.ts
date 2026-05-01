import { create } from 'zustand';

interface DeliveryStop {
  address:     string;
  recipientName:  string;
  recipientPhone: string;
  note?:       string;
}

interface DraftDelivery {
  pickupAddress:    string;
  stops:            DeliveryStop[];
  vehicleType:      string;
  scheduledAt?:     string;
  isRecurring:      boolean;
  recurringPattern: 'daily' | 'weekly' | 'monthly' | null;
  packageWeight?:   number;
  packageCategory?: string;
  specialInstructions?: string;
}

interface BusinessStore {
  draft: DraftDelivery;
  setDraft: (patch: Partial<DraftDelivery>) => void;
  resetDraft: () => void;
  addStop: (stop: DeliveryStop) => void;
  removeStop: (idx: number) => void;
  updateStop: (idx: number, patch: Partial<DeliveryStop>) => void;
}

const EMPTY_DRAFT: DraftDelivery = {
  pickupAddress:    '',
  stops:            [{ address: '', recipientName: '', recipientPhone: '' }],
  vehicleType:      'motorcycle',
  scheduledAt:      undefined,
  isRecurring:      false,
  recurringPattern: null,
  packageWeight:    undefined,
  packageCategory:  undefined,
  specialInstructions: undefined,
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
}));
