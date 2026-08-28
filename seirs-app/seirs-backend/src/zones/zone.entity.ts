import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { StateCode, GeopoliticalZone } from '../pricing/regions';

/**
 * SEIRS Zones: one idea, one table.
 *
 * Hotspot circles, restricted sub-zones and geopolitical zone overrides
 * were three separate half-built admin forms for the same sentence:
 * "inside this area, pricing behaves differently". All three wrote into
 * RateCard.regions, and on the live card that column is null, so all
 * three were inert. An admin could fill any of them in, publish, and no
 * price would move.
 *
 * None of them could say an area is CLOSED either. They were all
 * multipliers or surcharges, and a curfew, a state of emergency or a
 * flooded route is not a price. Founder: "when i say close it means
 * closed so no form of operation there". Charging 50% more to enter
 * somewhere dangerous is not a control, it is an incentive.
 *
 * This entity replaces all three with one row type that can price an
 * area, close an area, or both.
 */

export type ZoneShapeKind = 'circle' | 'polygon' | 'state' | 'geozone';

/**
 * open        allowed, effects still apply. This is how a cheaper or
 *             dearer area works with no warning shown to anyone.
 * surcharged  allowed, and the quote carries a line naming the zone and
 *             the reason. Never a silent uplift.
 * no_pickup   refused as ORIGIN, allowed as destination. Deliveries INTO
 *             the area still work.
 * no_dropoff  refused as DESTINATION, allowed as origin. Collections out
 *             of the area still work.
 * closed      refused at both ends. No quote, no booking, no rider
 *             offered the job.
 *
 * no_pickup and no_dropoff are deliberately separate rather than one
 * combined "restricted" flag, because in an emergency they are NOT
 * symmetrical: an area being evacuated must keep being collected FROM
 * while deliveries INTO it stop. A single flag cannot express that, and
 * the day it is needed is the day it cannot be deployed.
 */
export type ZoneStatus = 'open' | 'surcharged' | 'no_pickup' | 'no_dropoff' | 'closed';

export type ZoneActiveMode = 'always' | 'daily' | 'dateRange';

export interface ZoneShapeCircle  { kind: 'circle';  lat: number; lng: number; radiusKm: number }
export interface ZoneShapePolygon { kind: 'polygon'; points: Array<{ lat: number; lng: number }> }
export interface ZoneShapeState   { kind: 'state';   stateCode: StateCode }
export interface ZoneShapeGeozone { kind: 'geozone'; geozone: GeopoliticalZone }

export type ZoneShape =
  | ZoneShapeCircle
  | ZoneShapePolygon
  | ZoneShapeState
  | ZoneShapeGeozone;

export interface ZoneEffects {
  /**
   * Works in BOTH directions. Under 1.0 is CHEAPER, which is not a
   * mistake: some corridors genuinely cost less to serve, and a
   * discount is also how demand gets seeded somewhere new.
   */
  rateMultiplier?: number;
  /** Added to the quote as a named line whenever status is 'surcharged'. */
  surchargePct?: number;
  /** Pump prices really do differ by region; the rider is reimbursed at the local one. */
  fuelPriceOverride?: { petrolNgn?: number; dieselNgn?: number };
  /**
   * Canonical vehicle ids that may not operate at either end of a job
   * touching this zone. A ban is a refusal, not a price, so it is
   * gated by the same permission as a closure.
   */
  vehicleBans?: string[];
}

export interface ZoneActiveWindow {
  mode: ZoneActiveMode;
  /** 'HH:MM' in Nigerian local time. Wrap-around is supported: 18:00 to 06:00 is a curfew. */
  dailyFrom?: string;
  dailyTo?:   string;
  /** Absolute instants for a one-off closure (a flood, an election weekend). */
  startsAt?: string | null;
  endsAt?:   string | null;
}

@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Map fill. The admin page derives a default from status, but a human can override. */
  @Column({ type: 'varchar', length: 16, default: '#3A7BD5' })
  colour: string;

  @Column({ type: 'jsonb' })
  shape: ZoneShape;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: ZoneStatus;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  effects: ZoneEffects;

  @Column({ type: 'jsonb', default: () => `'{"mode":"always"}'::jsonb` })
  active: ZoneActiveWindow;

  /**
   * Shown to senders and riders whenever this zone blocks or surcharges.
   * A refusal with no reason reads as a broken app, and a surcharge with
   * no reason reads as a scam.
   */
  @Column({ type: 'text', default: '' })
  reason: string;

  /** Highest wins on overlap, among NON-blocking zones only. */
  @Column({ type: 'int', default: 0 })
  priority: number;

  /**
   * A draft zone is invisible to the engine. Drawing a closure and
   * publishing it are two different decisions, and the first must not
   * accidentally be the second.
   */
  @Index()
  @Column({ type: 'boolean', default: false })
  published: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
