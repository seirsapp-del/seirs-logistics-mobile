'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * An empty table said "No deliveries found" and stopped.
 *
 * For the person it is aimed at, that sentence raises a question it
 * refuses to answer: is the board genuinely clear, is my filter too
 * narrow, or is something broken? Those need three different reactions
 * and the screen gave one line of grey text for all of them.
 *
 * So an empty state here has to do three things: say which of those it
 * is, say it in the words the operator would use, and offer the way out
 * where there is one. "Nothing matches Chidi" with a Clear search button
 * beside it is a different screen from "No rider is waiting to be
 * approved", and both are different from an error.
 */
export function EmptyState({
  icon, title, body, action, tone = 'quiet',
}: {
  icon?:   ReactNode;
  title:   string;
  /** One sentence. What this means, or what to do about it. */
  body?:   string;
  action?: { label: string; href?: string; onClick?: () => void };
  /** `good` for "there is genuinely nothing to do", which is often the
   *  best news on an operations screen and should not read as a fault. */
  tone?:   'quiet' | 'good';
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${
          tone === 'good' ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F5F5F0] text-[#0F2B4C]/40'
        }`}>
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[#0F2B4C]">{title}</p>
      {body && (
        <p className="mt-1 max-w-md text-sm leading-relaxed text-[#0F2B4C]/50">{body}</p>
      )}
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-4 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f66b3]"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-4 rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-[#0F2B4C] hover:bg-[#F5F5F0]"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
