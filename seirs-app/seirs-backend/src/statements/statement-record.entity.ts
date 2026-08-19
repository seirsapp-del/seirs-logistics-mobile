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
  subjectType: 'partner' | 'driver';

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

  @CreateDateColumn()
  createdAt: Date;
}
