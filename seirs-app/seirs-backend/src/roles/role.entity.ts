import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// Spec V8 — dynamic admin roles. Replaces the hardcoded AdminSubRole
// enum with database-stored Role rows so super-admin can create
// custom job titles + bespoke permission sets without a code deploy.
//
// `isSystemRole` flags the 8 seeded baseline roles so they can't be
// deleted (they're our defaults — custom roles inherit from them
// conceptually but are independent).
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true, length: 64 })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Page-level permission slugs that match PATH_PERMISSIONS keys in the
  // admin middleware. Examples: 'overview', 'deliveries', 'fees'.
  // The special wildcard '*' grants access to every page.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  // System roles are seeded on boot and protected from deletion / edit.
  @Column({ default: false })
  isSystemRole: boolean;

  // Tailwind colour token for badges in the UI (e.g. 'red', 'blue').
  @Column({ length: 16, default: 'gray' })
  badgeColor: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
