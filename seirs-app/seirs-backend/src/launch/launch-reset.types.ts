/**
 * Shapes shared by the launch-reset service, its controller and the
 * admin dashboard's Launch Reset screen.
 *
 * They live in their own file so the preview response and the execute
 * response are provably the same object with extra fields, rather than
 * two hand-written shapes that drift. The screen renders one table off
 * `entities` whether it is looking at a dry run or at a finished run.
 */

/** The phrase an admin must type before anything is deleted. */
export const LAUNCH_RESET_PHRASE = 'RESET SEIRS FOR LAUNCH';

/** Why a single account cannot be deleted. */
export interface SkipReason {
  /** Stable machine code, so the UI can group without parsing prose. */
  code:
    | 'real_payment'
    | 'escrow_released'
    | 'earning_paid'
    | 'driver_payout'
    | 'partner_payout'
    | 'shared_history'
    | 'staff_account'
    | 'acting_admin';
  /** Sentence an admin reads on the screen. */
  reason: string;
  /** Rows behind the reason. */
  rows: number;
  /**
   * Money attached, to the kobo. A string, not a number: this is read
   * off Postgres decimals and shown verbatim, and a float round-trip is
   * exactly how a reconciliation figure loses its last kobo.
   */
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
  reasons: SkipReason[];
  /** Largest single amount across the reasons, for sorting the table. */
  topAmountNgn: string | null;
}

export interface EntityCount {
  /** Position in the deletion order. Children carry lower numbers. */
  order:  number;
  table:  string;
  label:  string;
  /** Rows the selection matched. -1 means the count itself failed. */
  rows:   number;
  sample: Array<{ id: string; label: string }>;
  /** Set when the table is absent or the count could not be taken. */
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
  /** Present only when the statement failed. The next run retries it. */
  error?:  string;
}

export interface LaunchResetReport {
  dryRun:             boolean;
  generatedAt:        string;
  confirmationPhrase: string;
  scope: {
    flag:  string;
    note:  string;
  };
  accounts: {
    candidates: number;
    deletable:  number;
    skipped:    number;
  };
  deletable:  AccountRow[];
  skipped:    SkippedAccount[];
  entities:   EntityCount[];
  totalRows:  number;
  preserved:  PreservedTable[];
  notes:      string[];
  /** Execute only. */
  deleted?:   DeletionOutcome[];
  /** Execute only: statements that failed and are safe to re-run. */
  failures?:  DeletionOutcome[];
  /** Execute only: true when every statement succeeded. */
  complete?:  boolean;
}
