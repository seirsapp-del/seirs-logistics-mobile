import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Draft for the Send a Package flow.
 *
 * Until this existed, every field on that screen lived in plain useState.
 * Backing out of the flow, or being pushed out of it (tapping "To a partner
 * store", answering a call, the OS reclaiming memory) threw away everything
 * the sender had typed: photos, receiver, addresses, the lot. The business
 * app has had a persisted draft since its rebuild (`seirs_business_draft`),
 * so the same booking on the two apps behaved completely differently.
 *
 * Only the draft is persisted. Transient UI state (predictions, the active
 * autocomplete field, loading and error flags) is deliberately excluded:
 * restoring a spinner or a stale error on next launch is worse than not
 * restoring it at all.
 */
export interface SendDraft {
  step:           number;
  photos:         string[];
  description:    string;
  category:       string | null;
  weightKg:       string;
  instructions:   string;
  declaredValue:  string;
  receiverFirst:  string;
  receiverLast:   string;
  receiverPhone:  string;
  destMode:       'address' | 'store';
  fallbackPref:   'hand_only' | 'neighbour' | 'gate' | 'store';
  neighbourName:  string;
  pickup:         any | null;
  dropoff:        any | null;
  pickupQuery:    string;
  dropoffQuery:   string;
  vehicleId:      string;
  scheduleNow:    boolean;
  scheduledDate:  string;
  scheduledHour:  number | null;
  paymentId:      string;
  /** Epoch ms of the last write, used to expire stale drafts. */
  savedAt:        number;
}

export const EMPTY_SEND_DRAFT: SendDraft = {
  step: 0,
  photos: [],
  description: '',
  category: null,
  weightKg: '',
  instructions: '',
  declaredValue: '',
  receiverFirst: '',
  receiverLast: '',
  receiverPhone: '',
  destMode: 'address',
  fallbackPref: 'hand_only',
  neighbourName: '',
  pickup: null,
  dropoff: null,
  pickupQuery: '',
  dropoffQuery: '',
  vehicleId: 'motorcycle',
  scheduleNow: true,
  scheduledDate: '',
  scheduledHour: null,
  paymentId: 'card',
  savedAt: 0,
};

/**
 * A draft older than this is dropped on load. Prices, the rate card and the
 * scheduling window all move; restoring a week-old booking would put stale
 * money on screen, which is the failure mode this whole sweep is about.
 */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SendDraftStore {
  draft: SendDraft;
  patchDraft: (patch: Partial<SendDraft>) => void;
  clearDraft: () => void;
  /** True when there is restorable content, not just an untouched shell. */
  hasContent: () => boolean;
}

export const useSendDraftStore = create<SendDraftStore>()(
  persist(
    (set, get) => ({
      draft: EMPTY_SEND_DRAFT,
      patchDraft: (patch) =>
        set((s) => ({ draft: { ...s.draft, ...patch, savedAt: Date.now() } })),
      clearDraft: () => set({ draft: EMPTY_SEND_DRAFT }),
      hasContent: () => {
        const d = get().draft;
        if (!d.savedAt) return false;
        if (Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) return false;
        return Boolean(
          d.photos.length || d.description || d.category || d.weightKg ||
          d.receiverFirst || d.receiverPhone || d.dropoffQuery ||
          d.pickupQuery || d.declaredValue || d.instructions,
        );
      },
    }),
    {
      name: 'seirs_customer_send_draft',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ((state: SendDraftStore) => ({ draft: state.draft })) as any,
    },
  ),
);
