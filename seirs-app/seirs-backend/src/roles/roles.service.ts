import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { User, UserRole } from '../users/user.entity';
import { SYSTEM_ROLES, PERMISSION_CATALOGUE, SYSTEM_ROLE_RECONCILE } from './roles.seed';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
    @InjectRepository(User) private usersRepo: Repository<User>,
  ) {}

  // Idempotent - only inserts roles whose slug isn't already present.
  // Existing system roles are NEVER overwritten so any custom permission
  // tweaks an admin made stick.
  async onModuleInit() {
    const existing  = await this.rolesRepo.find({ select: ['slug'] });
    const existingSlugs = new Set(existing.map(r => r.slug));
    const toInsert = SYSTEM_ROLES.filter(r => !existingSlugs.has(r.slug!));
    if (toInsert.length > 0) {
      await this.rolesRepo.save(toInsert.map(r => this.rolesRepo.create(r)));
      this.logger.log(`Seeded ${toInsert.length} system roles`);
    } else {
      this.logger.log(`Roles already seeded (${existing.length} present)`);
    }
    await this.reconcileSystemRoles();
  }

  /**
   * Apply SYSTEM_ROLE_RECONCILE to system roles that already exist.
   *
   * This used to be impossible: the seeder returned early the moment it
   * found any role row, so editing SYSTEM_ROLES only ever affected a
   * database that had never booted. Every deployed environment kept the
   * permission list it was first seeded with, which is why the founder's
   * Role Management screen still shows Support Agent without the Support
   * Inbox, the one page that role exists to work in.
   *
   * Not a blanket overwrite: see the note on SYSTEM_ROLE_RECONCILE for
   * why each grant and the single revoke are safe to apply without
   * asking. Custom roles and wildcard holders are left alone, and a role
   * that already matches is not written at all, so this is a no-op on
   * every boot after the first.
   */
  private async reconcileSystemRoles() {
    let changed = 0;
    for (const entry of SYSTEM_ROLE_RECONCILE) {
      const role = await this.rolesRepo.findOne({ where: { slug: entry.slug } });
      // Only system roles. A custom role that happens to share a slug is
      // somebody's own configuration and is not ours to edit.
      if (!role || !role.isSystemRole) continue;

      const perms = new Set(Array.isArray(role.permissions) ? role.permissions : []);
      // A wildcard already covers every page, present and future.
      if (perms.has('*')) continue;

      const before = perms.size;
      let removed = 0;
      for (const slug of entry.grant  ?? []) perms.add(slug);
      for (const slug of entry.revoke ?? []) { if (perms.delete(slug)) removed++; }
      if (perms.size === before && removed === 0) continue;

      await this.rolesRepo.update(role.id, { permissions: Array.from(perms).sort() });
      changed++;
    }
    if (changed > 0) {
      this.logger.log(`Reconciled permissions on ${changed} system role(s)`);
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async listAll() {
    return this.rolesRepo.find({ order: { isSystemRole: 'DESC', name: 'ASC' } });
  }

  async getOne(id: string) {
    const row = await this.rolesRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Role not found');
    return row;
  }

  // Catalogue of all available permissions for the role-editor UI.
  getCatalogue() {
    return PERMISSION_CATALOGUE;
  }

  // ── Writes ─────────────────────────────────────────────────────────────

  async create(data: { name: string; description?: string; permissions: string[]; badgeColor?: string }) {
    const slug = this.toSlug(data.name);
    const dupe = await this.rolesRepo.findOne({ where: { slug } });
    if (dupe) throw new BadRequestException('A role with this name already exists');

    const row = await this.rolesRepo.save(this.rolesRepo.create({
      slug,
      name:        data.name.trim(),
      description: data.description?.trim() ?? null,
      permissions: this.dedupePermissions(data.permissions),
      isSystemRole: false,
      badgeColor:  data.badgeColor ?? 'gray',
    }));
    return row;
  }

  async update(id: string, data: { name?: string; description?: string; permissions?: string[]; badgeColor?: string }) {
    const role = await this.getOne(id);
    if (role.isSystemRole && data.name && data.name !== role.name) {
      throw new ForbiddenException('Cannot rename a system role');
    }
    await this.rolesRepo.update(id, {
      name:        data.name        ?? role.name,
      description: data.description ?? role.description,
      permissions: data.permissions ? this.dedupePermissions(data.permissions) : role.permissions,
      badgeColor:  data.badgeColor  ?? role.badgeColor,
    });
    return this.getOne(id);
  }

  async delete(id: string) {
    const role = await this.getOne(id);
    if (role.isSystemRole) throw new ForbiddenException('System roles cannot be deleted');

    // Don't orphan users
    const usersWithRole = await this.usersRepo.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      throw new BadRequestException(
        `Cannot delete - ${usersWithRole} user${usersWithRole === 1 ? '' : 's'} still assigned to this role. Reassign them first.`,
      );
    }

    await this.rolesRepo.delete(id);
    return { deleted: true };
  }

  // ── User assignment ────────────────────────────────────────────────────

  async assignToUser(userId: string, roleId: string) {
    const role = await this.getOne(roleId);
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Roles can only be assigned to admin users');
    }

    // Safety: cannot remove the last super_admin
    if (role.slug !== 'super_admin') {
      const currentRole = user.roleId ? await this.rolesRepo.findOne({ where: { id: user.roleId } }) : null;
      if (currentRole?.slug === 'super_admin') {
        const otherSupers = await this.usersRepo
          .createQueryBuilder('u')
          .innerJoin('roles', 'r', 'r.id = u.roleId')
          .where('r.slug = :slug', { slug: 'super_admin' })
          .andWhere('u.id != :uid', { uid: userId })
          .andWhere('u.isActive = true')
          .getCount();
        if (otherSupers === 0) {
          throw new ForbiddenException(
            'Cannot demote the last Super Admin - promote someone else first.',
          );
        }
      }
    }

    await this.usersRepo.update(userId, { roleId });
    return { assigned: true, roleSlug: role.slug };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private toSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
  }

  private dedupePermissions(perms: string[]): string[] {
    const set = new Set(perms.map(p => p.trim()).filter(Boolean));
    // If wildcard present, collapse to just '*'
    if (set.has('*')) return ['*'];
    return Array.from(set).sort();
  }
}
