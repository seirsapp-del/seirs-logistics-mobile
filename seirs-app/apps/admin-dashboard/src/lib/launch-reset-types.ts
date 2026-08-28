/**
 * Mirror of seirs-backend/src/launch/launch-reset.types.ts.
 *
 * Kept as one file the API client and the screen both import, so the
 * table of counts, the skipped list and the preserved list are all
 * rendered from the same shape the server actually sends. The preview
 * and the finished run are the same object with three extra fields,
 * which is why one screen can render both.
 */

export type SkipCode =
  | 'real_payment'
  | 'escrow_released'
  | 'earning_paid'
  | 'driver_payout'
  | 'partner_payout'
  | 'shared_history'
  | 'staff_account'
  | 'acting_admin';

export interface SkipReason {
  code:      SkipCode;
  reason:    string;
  rows:      number;
  /** Naira to the kobo, as a string. Never re-round it for display. */
  amountNgn: string | null;
}

export interface AccountRow {
  id:        string;
  name:      string;
  email:     string;
  accountId: string | null;
  role:      string;
  isDemo:    boolean;
}

export interface SkippedAccount extends AccountRow {
  reasons:      SkipReason[];
  topAmountNgn: string | null;
}

export interface EntityCount {
  order:  number;
  table:  string;
  label:  string;
  /** -1 means the count itself failed and the row needs reading. */
  rows:   number;
  sample: Array<{ id: string; label: string }>;
  note?:  string;
}

export interface PreservedTable {
  table: string;
  why:   string;
}

export interface DeletionOutcome {
  order:   number;
  table:   string;
  label:   string;
  deleted: number;
  error?:  string;
}

export interface LaunchResetReport {
  dryRun:             boolean;
  generatedAt:        string;
  confirmationPhrase: string;
  scope:              { flag: string; note: string };
  accounts:           { candidates: number; deletable: number; skipped: number };
  deletable:          AccountRow[];
  skipped:            SkippedAccount[];
  entities:           EntityCount[];
  totalRows:          number;
  preserved:          PreservedTable[];
  notes:              string[];
  deleted?:           DeletionOutcome[];
  failures?:          DeletionOutcome[];
  complete?:          boolean;
}
