'use client';

import { useEffect, useState } from 'react';

/**
 * Admin-managed backdrop for headers on CLIENT pages (contact, track,
 * find-a-partner), which cannot read image slots on the server the way the
 * server pages do.
 *
 * Each page passes its own slot name, so every backdrop is individually
 * changeable in Website > Page Blocks (founder 2026-08-15: not shared).
 * The slots map is fetched once per session and cached at module level, so
 * three headers on three visits cost one request.
 *
 * Renders nothing until the slot resolves with an image: the header shows
 * its normal navy gradient, and the backdrop fades in behind the (already
 * relative) content. An unreachable API means it simply never appears.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

let slotsPromise: Promise<Record<string, string>> | null = null;
function getSlots(): Promise<Record<string, string>> {
  slotsPromise ??= fetch(`${API_BASE}/website/image-slots`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return slotsPromise;
}

export function HeroBackdrop({ slot }: { slot: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSlots().then((slots) => {
      if (alive && slots[slot]) setUrl(slots[slot]);
    });
    return () => { alive = false; };
  }, [slot]);

  if (!url) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-0 bg-cover bg-center opacity-25 transition-opacity duration-500"
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}
