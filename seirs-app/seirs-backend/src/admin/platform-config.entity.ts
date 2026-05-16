import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Platform-wide configuration values. Key/value store so we can add new
 * settings without migrations. Edits are audit-logged via the existing
 * AdminService.recordAudit hook. Some keys are conventionally read-only
 * (returned with isEditable: false to the UI).
 *
 * Keys in use:
 *   support_email          — public support inbox shown on the website
 *   max_active_deliveries  — soft cap; matching service refuses new pickups above this
 *   maintenance_mode       — 'on' | 'off'; when 'on' the apps render a maintenance screen
 *   platform_name          — display name (read-only; literally "Seirs Logistics")
 *   default_currency       — read-only at launch; FX is v1.1
 *   default_timezone       — read-only
 */
@Entity('platform_config')
export class PlatformConfig {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isEditable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
