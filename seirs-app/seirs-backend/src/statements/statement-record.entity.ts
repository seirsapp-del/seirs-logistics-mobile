import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

/**
 * The authoritative record behind an issued statement.
 *
 * A PDF is not tamper-proof. Anyone can open one in an editor and change
 * a number, and a watermark only makes casual copying obvious: it stops
 * nothing. What makes a statement trustworthy is that the person reading
 * it can check it against the issuer.
 *
 * Every statement SEIRS generates writes one of these rows and prints its
 * code and a QR on the document. A bank, landlord or tax officer opens
 * the link and sees the figures SEIRS actually issued. If the paper says
 * something else, the paper is wrong.
 *
 * Rows are immutable by convention: a corrected statement is a new
 * statement with a new code, never an edit of an old one.
 */
@Entity('statement_records')
export class StatementRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short, human-readable, printed on the document. */
  @Index({ unique: true })
  @Column({ length: 24 })
  code: string;

  @Column({ length: 16 })
  subjectType: 'partner' | 'driver' | 'business';

  @Index()
  @Column({ type: 'uuid' })
  subjectId: string;

  /** Denormalised so a verification page never has to join anything. */
  @Column()
  subjectName: string;

  @Column({ type: 'timestamptz' })
  periodFrom: Date;

  @Column({ type: 'timestamptz' })
  periodTo: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPaidNgn: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalPendingNgn: number;

  @Column({ type: 'int', default: 0 })
  lineCount: number;

  /** Who asked for it: the subject themselves, or an admin on their behalf. */
  @Column({ length: 32, default: 'self' })
  issuedBy: string;

  /**
   * The document itself, exactly as issued.
   *
   * Stored rather than regenerated on demand, and that is the whole
   * point. Regenerating reads live data, so a payment refunded after
   * issue would produce a PDF that disagrees with the totals on this
   * row, and the verification page would then contradict the document
   * it exists to confirm. Immutable record, immutable bytes.
   *
   * Around 7KB each. Nullable because rows written before 2026-09-01
   * have no bytes to serve and must fail as "expired" rather than as a
   * server error.
   */
  @Column({ type: 'bytea', nullable: true })
  pdf: Buffer | null;

  /**
   * When the download link stops working. NOT when verification stops.
   *
   * Those are deliberately different lifetimes. The code printed on the
   * paper has to verify forever: somebody may check a statement months
   * later, which is the entire reason the code exists. The download URL
   * is a delivery mechanism that travels by email and gets forwarded,
   * and a permanent public link to a company's full line-by-line spend
   * is a much larger exposure than the totals the verify page shows.
   *
   * So the link dies and the record does not. Re-issuing is a tap.
   */
  @Column({ type: 'timestamptz', nullable: true })
  downloadExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
