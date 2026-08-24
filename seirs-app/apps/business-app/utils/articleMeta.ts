import type { TFunction } from 'i18next';

/**
 * Article meta helpers: pure functions used by the article view's meta
 * row. No state, no React, easy to unit test if we ever need to.
 */

const WORDS_PER_MINUTE = 200;

/**
 * Estimate reading time in minutes from the article body's word count.
 * Always returns at least 1.
 */
export function calcReadingMinutes(body: string[] | string): number {
  const text = Array.isArray(body) ? body.join(' ') : body;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Human-friendly relative date: "Today" / "Yesterday" / "3 days ago"
 * etc. Falls through to an absolute date for anything over a year old.
 * All strings come from i18n so locale formatting is consistent.
 */
export function relativeDate(iso: string | undefined, t: TFunction): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0)   return t('common.justNow');
  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');
  if (diffDays < 7)   return t('common.daysAgo',   { n: diffDays });
  if (diffDays < 30)  return t('common.weeksAgo',  { n: Math.floor(diffDays / 7)  });
  if (diffDays < 365) return t('common.monthsAgo', { n: Math.floor(diffDays / 30) });
  return t('common.yearsAgo', { n: Math.floor(diffDays / 365) });
}
