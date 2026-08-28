'use client';
import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What this page is for, in one sentence, on the page.
 *
 * Every screen in here opened with a bare title. "Zones" tells a new ops
 * hire nothing about what publishing one does to the price a customer
 * is charged, or that closing an area stops SEIRS working there the
 * moment they press save. The knowledge existed only in the head of
 * whoever built it, and in commit messages nobody on the ops desk will
 * ever read.
 *
 * Deliberately not a modal and not a tour. It is one line that is always
 * there, plus an optional "what do these do" panel for the pages whose
 * buttons carry consequences. The panel remembers being dismissed, per
 * page, so it teaches once and then gets out of the way rather than
 * nagging somebody who has used the screen four hundred times.
 *
 * localStorage can throw outright in a locked-down browser, so every
 * read and write is guarded and the panel simply defaults to open.
 */
export function PageIntro({
  title, purpose, help, actions, storageKey,
}: {
  title:    string;
  /** One sentence: what this page is for. Always visible. */
  purpose:  string;
  /** Optional: what the buttons on this page actually do. Dismissible. */
  help?:    ReactNode;
  /** Right-aligned controls (filters, primary action). */
  actions?: ReactNode;
  /** Distinct per page, or two pages share one dismissal. */
  storageKey?: string;
}) {
  const key = storageKey ? `seirs.intro.${storageKey}` : null;
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!help || !key) return;
    try {
      setShowHelp(window.localStorage.getItem(key) !== 'dismissed');
    } catch {
      setShowHelp(true);
    }
  }, [help, key]);

  const dismiss = () => {
    setShowHelp(false);
    try { if (key) window.localStorage.setItem(key, 'dismissed'); } catch { /* fine */ }
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#0F2B4C]">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#0F2B4C]/50">{purpose}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {help && !showHelp && (
        <button
          onClick={() => setShowHelp(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3A7BD5] hover:underline"
        >
          <Info size={12} /> What do these do?
        </button>
      )}

      {help && showHelp && (
        <div className="relative mt-3 rounded-xl border border-[#3A7BD5]/20 bg-[#3A7BD5]/[0.04] px-4 py-3 pr-10">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#3A7BD5]">
            <Info size={12} /> What do these do
          </p>
          <div className="space-y-1 text-sm leading-relaxed text-[#0F2B4C]/70">{help}</div>
          <button
            onClick={dismiss}
            aria-label="Hide this explanation"
            className="absolute right-2 top-2 rounded p-1 text-[#0F2B4C]/30 hover:bg-white hover:text-[#0F2B4C]"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
