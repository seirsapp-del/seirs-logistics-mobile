import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Draft for the Send a Package flow.
 *
 * Deliberately NOT a zustand store, and that is not a style preference.
 * This workspace has two copies of React: 19.2.5 at the root and 19.1.0
 * nested in apps/customer-app. A store from a root-installed library
 * resolves React from the root, while this app's screens resolve it from
 * the nested copy. Both Reacts then meet in one component tree and every
 * hook in that tree throws "Invalid hook call", which is exactly what the
 * Send screen did the first time it was opened on a device.
 *
 * Written with plain React and AsyncStorage instead, so it resolves the
 * same React the screen does and adds no new boundary. Deduplicating the
 * two Reacts is the real repair, but that is a dependency change to make
 * deliberately, not in passing.
 *
 * Only Send uses this, so there is no cross-screen sync to maintain: a
 * module-level cache plus a listener set is enough.
 */
export interface SendDraft {
  step:           number;
  packages:       any[];
  pickup:         any | null;
  pickupQuery:    string;
  vehicleId:      string;
  scheduleNow:    boolean;
  scheduledDate:  string;
  scheduledHour:  number | null;
  paymentId:      string;
  /**
   * Promo code the customer accepted on /promo. Held here (not redeemed
   * on that screen) because POST /promotions/redeem is a REAL redemption:
   * it writes a redemption row and increments the campaign usage count.
   * Calling it from the code box burned the customer's one allowed use
   * against a subtotal of zero. The code now rides along to
   * deliveriesApi.create so redemption happens once, at booking.
   */
  promoCode?:     string;
  /** Epoch ms of the last write, used to expire stale drafts. */
  savedAt:        number;

  // Fields kept for drafts written before the multi-package rebuild, so an
  // in-flight draft is not thrown away by the upgrade.
  photos?:        string[];
  description?:   string;
  category?:      string | null;
  weightKg?:      string;
  instructions?:  string;
  declaredValue?: string;
  receiverFirst?: string;
  receiverLast?:  string;
  receiverPhone?: string;
  destMode?:      'address' | 'store';
  fallbackPref?:  'hand_only' | 'neighbour' | 'gate' | 'store';
  neighbourName?: string;
  dropoff?:       any | null;
  dropoffQuery?:  string;
}

export const EMPTY_SEND_DRAFT: SendDraft = {
  step: 0,
  packages: [],
  pickup: null,
  pickupQuery: '',
  vehicleId: 'motorcycle',
  scheduleNow: true,
  scheduledDate: '',
  scheduledHour: null,
  paymentId: 'card',
  savedAt: 0,
};

/**
 * A draft older than this is dropped on load. Prices, the rate card and
 * the scheduling window all move; restoring a week-old booking would put
 * stale money on screen.
 */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const KEY = 'seirs_customer_send_draft';

let cache: SendDraft = EMPTY_SEND_DRAFT;
let ready = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => { listeners.forEach(fn => fn()); };

function load(): Promise<void> {
  if (loading) return loading;
  loading = AsyncStorage.getItem(KEY)
    .then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            cache = { ...EMPTY_SEND_DRAFT, ...parsed };
          }
        } catch { /* a corrupt draft is not worth crashing over */ }
      }
    })
    .catch(() => { /* no draft is a normal state */ })
    .finally(() => { ready = true; notify(); });
  return loading;
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}

export function useSendDraftStore() {
  const [, bump] = useState(0);

  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    load();
    return () => { listeners.delete(fn); };
  }, []);

  const patchDraft = useCallback((patch: Partial<SendDraft>) => {
    cache = { ...cache, ...patch, savedAt: Date.now() };
    persist();
  }, []);

  const clearDraft = useCallback(() => {
    cache = EMPTY_SEND_DRAFT;
    AsyncStorage.removeItem(KEY).catch(() => {});
    notify();
  }, []);

  const hasContent = useCallback(() => {
    const d = cache;
    if (!d.savedAt) return false;
    if (Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) return false;
    if (Array.isArray(d.packages) && d.packages.length > 0) {
      return d.packages.some((p: any) =>
        (p?.photos?.length ?? 0) > 0 || p?.description || p?.category ||
        p?.weightKg || p?.receiverFirst || p?.receiverPhone || p?.dropoffQuery);
    }
    return Boolean(
      d.photos?.length || d.description || d.category || d.weightKg ||
      d.receiverFirst || d.receiverPhone || d.dropoffQuery || d.pickupQuery);
  }, []);

  return { draft: cache, ready, patchDraft, clearDraft, hasContent };
}
