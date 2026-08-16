import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local bookmark store — keeps a list of hero-card IDs the user has
 * saved for later. Persists to AsyncStorage so bookmarks survive app
 * restart. No backend yet — when the CMS lands (Phase 2) we can sync
 * these to the user account.
 *
 * Module-level cache means every screen that calls `useBookmarks()`
 * reads the same value without each one having to re-read storage.
 */

const STORAGE_KEY = 'seirs.bookmarks.v1';

let memoryCache: string[] | null = null;
const subscribers = new Set<(ids: string[]) => void>();

function notify(ids: string[]) {
  memoryCache = ids;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(() => {});
  for (const cb of subscribers) cb(ids);
}

async function loadCache(): Promise<string[]> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    memoryCache = raw ? JSON.parse(raw) : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache ?? [];
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<string[]>(memoryCache ?? []);

  useEffect(() => {
    let alive = true;
    loadCache().then(ids => { if (alive) setBookmarks(ids); });
    subscribers.add(setBookmarks);
    return () => {
      alive = false;
      subscribers.delete(setBookmarks);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const current = memoryCache ?? [];
    const next = current.includes(id)
      ? current.filter(b => b !== id)
      : [...current, id];
    notify(next);
  }, []);

  const isBookmarked = useCallback(
    (id: string) => bookmarks.includes(id),
    [bookmarks],
  );

  return { bookmarks, toggle, isBookmarked };
}
