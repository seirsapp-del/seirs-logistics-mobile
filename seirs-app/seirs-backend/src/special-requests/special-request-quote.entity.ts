import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A price somebody at SEIRS wrote down, and the reasoning behind it.
 *
 * A CHILD ROW rather than fields on the request, for the reason
 * DriverVehicleChange gives for the same decision: quotes get re-issued.
 * Diesel moves, ops get a vehicle class wrong, a sender pushes back and we
 * come down. Writing the new quote over the old one destroys the record of
 * what we offered and when, which is exactly the record wanted when
 * somebody says "you quoted me less last week".
 *
 * Superseded quotes are kept and marked, never deleted.
 */

/** What a line is FOR. Free text here would defeat the itemisation. */
export enum QuoteLineKind {
  VEHICLE   = 'vehicle',
  LABOUR    = 'labour',
  WAITING   = 'waiting',
  PERMIT    = 'permit',
  ESCORT    = 'escort',
  INSURANCE = 'insurance',
  OTHER     = 'other',
}

export interface QuoteLine {
  kind:      QuoteLineKind;
  /** What the customer reads. "Three men, two hours" not "LABOUR_3H2". */
  label:     string;
  qty:       number;
  unitNgn:   number;
  amountNgn: number;
}

@Entity('special_request_quotes')
@Index(['requestId', 'createdAt'])
export class SpecialRequestQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  requestId: string;

  /**
   * The breakdown, and it is not optional.
   *
   * A bare large number with nothing behind it reads as a shakedown, and
   * on a job somebody has never bought before it is the difference between
   * a price and a demand. Vehicle class, hands and hours, waiting, permits,
   * escort, insurance uplift: each line is a thing the customer can
   * picture, and a thing they can argue with.
   */
  @Column({ type: 'jsonb' })
  lines: QuoteLine[];

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalNgn: string;

  /**
   * When this stops being a price we will honour.
   *
   * Diesel moves, and so does what a day of three men costs. An accepted
   * stale quote is a loss we have to eat, because the number was ours. The
   * window comes from the Fee Catalogue rather than a constant here, so it
   * can be moved without a deploy when fuel does something sudden.
   */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  quotedByAdminId: string | null;

  /** What ops want the sender to understand about the number. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /**
   * Set when a newer quote replaces this one. Never deleted.
   *
   * The current quote is the one row for this request with supersededAt
   * NULL, which also means "has this been re-quoted" is answerable without
   * comparing timestamps.
   */
  @Column({ type: 'timestamptz', nullable: true })
  supersededAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * A phone call about one of these jobs.
 *
 * On a special request the call IS the product: nobody quotes a generator
 * move off a form. There was nowhere to record one, so what was agreed
 * lived in whichever admin's memory took the call.
 *
 * Text only, same as the partner call log: the judgement is the artefact,
 * and recording somebody's voice creates personal data we would then have
 * to protect and justify.
 */
@Entity('special_request_calls')
@Index(['requestId', 'createdAt'])
export class SpecialRequestCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'uuid', nullable: true })
  adminUserId: string | null;

  /** Null when the call did not connect, which is itself worth recording. */
  @Column({ type: 'timestamptz', nullable: true })
  calledAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  spokeTo: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
