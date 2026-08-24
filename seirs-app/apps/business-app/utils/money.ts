/**
 * Money display, SEIRS house standard (founder 2026-08-24).
 *
 * Amounts render to the kobo, always two decimals: NGN 2,609.06, never
 * NGN 2,609. This REVERSES the old whole-naira rule, and the reason is
 * reconciliation. When a driver's share, the SEIRS cut and the
 * processor fee are each rounded on their own they stop adding up to
 * what the customer was actually charged. A live payment settled at
 * 2,661.25 charged, 52.19 processor fee, 3.92 VAT, 2,605.14 net: not
 * one of those is a whole number, and Flutterwave reports every one of
 * them to the kobo, so we show them the same way.
 *
 * Number() coercion is not optional. Postgres returns decimal columns
 * as strings ("1500.00"), and String.prototype.toLocaleString ignores
 * the options argument and hands the string straight back, so an
 * uncoerced value rendered as "1500.00" with no thousands separator.
 * That was a real bug on the admin dashboard. Coercing first is what
 * keeps it dead.
 *
 * Loyalty points are a count, not money: format those with a plain
 * toLocaleString so they stay whole.
 */

/** Two-decimal amount with thousands separators, no currency symbol. */
export function nairaAmount(v: unknown): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The same, prefixed with the naira sign. This is the default for UI. */
export function naira(v: unknown): string {
  return `₦${nairaAmount(v)}`;
}

/**
 * Kobo is a STORAGE unit and never changes. This is the one sanctioned
 * way to show one: divide by 100 first, then format to two decimals.
 */
export function nairaFromKobo(kobo: unknown): string {
  const k = Number(kobo ?? 0);
  return naira((Number.isFinite(k) ? k : 0) / 100);
}

/**
 * Compact form for chart axes and tiles where a full kobo amount would
 * not fit. Abbreviation is not rounding-for-display: any exact figure
 * it stands in for is still shown to the kobo somewhere on the screen.
 */
export function nairaShort(v: unknown): string {
  const n = Number(v ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  if (Math.abs(safe) >= 1_000_000) return `₦${(safe / 1_000_000).toFixed(1)}M`;
  if (Math.abs(safe) >= 1_000)     return `₦${(safe / 1_000).toFixed(1)}K`;
  return naira(safe);
}
