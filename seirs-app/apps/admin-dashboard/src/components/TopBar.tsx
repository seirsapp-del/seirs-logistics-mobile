'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User as UserIcon, Truck, Package, X, Loader2, Compass } from 'lucide-react';
import { NAV_SECTIONS, isNavItemVisible, canAccessFromUser, isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';
import { adminApi } from '@/lib/api';

/**
 * Top bar with universal search. Sits above the main content area,
 * matches the sidebar height (h-16) so the two lines flow together.
 *
 * Search behaviour:
 * - Debounced 300ms on input
 * - Backend endpoint returns typed hits (user, driver, delivery)
 * - Keyboard: Cmd/Ctrl+K to focus, ArrowUp/Down to navigate, Enter to open,
 *   Escape to close
 * - Click outside closes dropdown
 */

type Hit = {
  type:     'user' | 'driver' | 'delivery' | 'page';
  id:       string;
  label:    string;
  sublabel: string;
  href:     string;
};

const ICON_FOR_TYPE = {
  user:     UserIcon,
  driver:   Truck,
  delivery: Package,
  page:     Compass,
};

const TYPE_ACCENT = {
  user:     'text-blue-600 bg-blue-50',
  driver:   'text-orange-600 bg-orange-50',
  delivery: 'text-emerald-600 bg-emerald-50',
  page:     'text-[#0F2B4C] bg-[#0F2B4C]/5',
};

/**
 * The palette could find a RECORD and not a PAGE.
 *
 * Ctrl+K searched users, drivers and deliveries, which is the right
 * half of the job. The other half is getting somewhere: the sidebar is
 * ten sections and forty four rows, and somebody who wants Zones has to
 * know it lives under OPERATIONS and not, say, PRICING, which is
 * exactly the kind of thing a non-technical hire has no reason to know.
 *
 * Pages are matched locally, so they appear instantly with no request,
 * and they are filtered through the same permission check the sidebar
 * uses. A palette that offers you a page you would be refused is worse
 * than one that offers nothing: it teaches people the tool is broken.
 *
 * The section name rides along as the sublabel, so the palette also
 * teaches where a page lives rather than just teleporting you there.
 */
function matchPages(term: string, allowed: (permission: string) => boolean): Hit[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const out: Hit[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!isNavItemVisible(item.href)) continue;
      if (!allowed(item.permission)) continue;
      const hay = `${item.label} ${section.title}`.toLowerCase();
      if (!hay.includes(q)) continue;
      out.push({
        type:     'page',
        id:       item.href,
        label:    item.label,
        sublabel: section.title,
        href:     item.href,
      });
    }
  }
  /* A page whose name starts with what was typed is almost always the
     one meant, so "dr" offers Drivers before Fraud and Duplicates. */
  return out
    .sort((a, b) => {
      const as = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.label.localeCompare(b.label);
    })
    .slice(0, 6);
}

export default function TopBar() {
  const router  = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef  = useRef<HTMLDivElement | null>(null);
  const [q,        setQ]        = useState('');
  const [hits,     setHits]     = useState<Hit[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [activeIx, setActiveIx] = useState(0);

  /* Same gate the sidebar applies, so the palette can never offer a
     page the middleware would then refuse. */
  const allowPage = useCallback((permission: string) => {
    const user = getUser();
    if (permission === 'super_admin_only') return isSuperAdminFromUser(user as any);
    return canAccessFromUser(user as any, permission);
  }, []);

  // Cmd/Ctrl+K to focus, Escape to close, arrow keys + Enter for nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      adminApi.search(term)
        /* Pages first: they resolve locally and they are usually what a
           short query means. "del" is far more often Deliveries than a
           person called Delia. */
        .then(r => { setHits([...matchPages(term, allowPage), ...(r?.hits ?? [])]); setActiveIx(0); })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const openHit = useCallback((hit: Hit) => {
    router.push(hit.href);
    setOpen(false);
    setQ('');
  }, [router]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIx(i => Math.min(hits.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter')     { e.preventDefault(); openHit(hits[activeIx]); }
  };

  return (
    <div ref={rootRef} className="h-16 border-b border-[#E5E7EB] bg-white flex items-center px-4 gap-3 sticky top-0 z-30">
      <div className="relative flex-1 max-w-2xl">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/40 pointer-events-none" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { if (q.trim().length >= 2) setOpen(true); }}
          onKeyDown={onInputKeyDown}
          placeholder="Search a page, a person, a rider or a tracking code..."
          className="w-full pl-9 pr-14 py-2.5 rounded-lg border border-[#E5E7EB] text-sm bg-[#F8F9FB] text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] placeholder:text-[#0F2B4C]/40"
        />
        {/* Right-side controls: loader when searching, clear button, or Cmd+K hint */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 size={14} className="animate-spin text-[#0F2B4C]/40" />}
          {q && !loading && (
            <button
              onClick={() => { setQ(''); setHits([]); inputRef.current?.focus(); }}
              className="text-[#0F2B4C]/40 hover:text-[#0F2B4C]/70"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
          {!q && (
            <kbd className="hidden md:inline-block text-[10px] font-semibold text-[#0F2B4C]/40 bg-[#0F2B4C]/5 border border-[#0F2B4C]/10 rounded px-1.5 py-0.5">
              {typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}
            </kbd>
          )}
        </div>

        {/* Dropdown. Hits are grouped by lowercased label so when one
            person has multiple accounts (e.g. customer + driver + business),
            they cluster under a single name header for fraud investigation.
            The activeIx still indexes the flat list so keyboard nav works. */}
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-96 overflow-y-auto">
            {hits.length === 0 && !loading && (
              <div className="px-4 py-6 text-sm text-[#0F2B4C]/50 text-center">
                No matches for &ldquo;{q}&rdquo;
              </div>
            )}
            {(() => {
              // Bucket hits by name (case-insensitive, whitespace-normalised).
              // Preserves insertion order via a Map. Deliveries stand alone
              // (their "label" is a tracking code, not a person's name).
              const groups = new Map<string, Hit[]>();
              const deliveryHits: Hit[] = [];
              for (const h of hits) {
                if (h.type === 'delivery') { deliveryHits.push(h); continue; }
                const k = h.label.toLowerCase().replace(/\s+/g, ' ').trim();
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k)!.push(h);
              }

              // Flat index for keyboard navigation stays in sync with render order.
              let flatIx = -1;
              const nodes: React.ReactNode[] = [];

              for (const [, groupHits] of groups) {
                const label = groupHits[0].label;
                const multi = groupHits.length > 1;
                nodes.push(
                  <div key={`group-${label}`} className={multi ? 'border-b border-[#E5E7EB]/60 last:border-b-0' : ''}>
                    {multi && (
                      <div className="px-3 py-1.5 bg-[#F8F9FB] text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/60 flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-[9px] text-[#0F2B4C]/40">{groupHits.length} accounts</span>
                      </div>
                    )}
                    {groupHits.map((h) => {
                      flatIx += 1;
                      const idx = flatIx;
                      const Icon = ICON_FOR_TYPE[h.type];
                      const accent = TYPE_ACCENT[h.type];
                      const isActive = idx === activeIx;
                      return (
                        <button
                          key={`${h.type}-${h.id}`}
                          onClick={() => openHit(h)}
                          onMouseEnter={() => setActiveIx(idx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            isActive ? 'bg-[#F8F9FB]' : 'bg-white'
                          } ${multi ? 'pl-6' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
                            <Icon size={15} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[#0F2B4C] truncate">{multi ? h.type : h.label}</div>
                            <div className="text-xs text-[#0F2B4C]/50 truncate">{h.sublabel}</div>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/30">
                            {h.type}
                          </span>
                        </button>
                      );
                    })}
                  </div>,
                );
              }

              // Deliveries at the bottom under their own header
              if (deliveryHits.length > 0) {
                if (groups.size > 0) {
                  nodes.push(
                    <div key="deliveries-header" className="px-3 py-1.5 bg-[#F8F9FB] text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/60 border-t border-[#E5E7EB]/60">
                      Deliveries
                    </div>,
                  );
                }
                for (const h of deliveryHits) {
                  flatIx += 1;
                  const idx = flatIx;
                  const Icon = ICON_FOR_TYPE[h.type];
                  const accent = TYPE_ACCENT[h.type];
                  const isActive = idx === activeIx;
                  nodes.push(
                    <button
                      key={`${h.type}-${h.id}`}
                      onClick={() => openHit(h)}
                      onMouseEnter={() => setActiveIx(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-[#F8F9FB]' : 'bg-white'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
                        <Icon size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#0F2B4C] truncate">{h.label}</div>
                        <div className="text-xs text-[#0F2B4C]/50 truncate">{h.sublabel}</div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/30">
                        {h.type}
                      </span>
                    </button>,
                  );
                }
              }

              return nodes;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
