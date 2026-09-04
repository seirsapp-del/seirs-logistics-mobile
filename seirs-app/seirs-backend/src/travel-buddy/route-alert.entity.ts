import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Somebody wants this corridor, and nobody is running it yet.
 *
 * A Travel Buddy search that returns nothing used to end there: an
 * apology, and a person who leaves. That person has just named both ends
 * of a journey they intend to pay for, which is the cleanest demand
 * signal this business gets, and it was being thrown away every time
 * (founder 2026-09-04, watching a live search for Ife to Ibadan come
 * back empty).
 *
 * Two jobs, and the second is the valuable one. It lets us tell the
 * passenger when a driver finally declares the route, and it gives
 * operations a ranked list of corridors worth recruiting drivers onto,
 * built from real intent rather than guesswork.
 *
 * Cities are stored as the passenger typed them, lowercased for matching.
 * They are NOT resolved against a canonical list: the whole reason this
 * row exists is that the route is not in the system yet, so there is
 * nothing to resolve against.
 */
@Entity('route_alerts')
@Index(['fromCity', 'toCity'])
export class RouteAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Lowercased at write time so counting watchers is a plain GROUP BY. */
  @Column({ type: 'varchar', length: 120 })
  fromCity: string;

  @Column({ type: 'varchar', length: 120 })
  toCity: string;

  /**
   * Set when a matching trip is declared and the passenger is told, so
   * one alert fires once rather than on every trip on that corridor
   * forever.
   */
  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
