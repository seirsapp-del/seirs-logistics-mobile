import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Ip,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { RolesService } from './roles.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

/**
 * Admin role management.
 *
 * This said "Super-admin-only" and then enforced it with AdminGuard,
 * noting that "UI gates the create/delete actions further". The UI is
 * not a security boundary: the API was reachable by any staff account.
 *
 * That made this a second route to full privilege escalation, alongside
 * POST /admin/admins which was closed the same day. Here the path was
 * even shorter: create a role holding every permission, then call
 * POST /admin/roles/:roleId/assign/:userId with your own user id.
 *
 * Reads stay on AdminGuard so staff can see which roles exist. Every
 * write that defines or grants permission now requires super admin, in
 * the API rather than the screen. Found by the 2026-08-13 RBAC audit.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get()
  list() {
    return this.svc.listAll();
  }

  @Get('catalogue')
  catalogue() {
    return this.svc.getCatalogue();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @UseGuards(SuperAdminGuard)
  @Post()
  create(
    @Body() body: { name: string; description?: string; permissions: string[]; badgeColor?: string },
    @CurrentUser() actor: User,
    @Ip() ip?: string,
  ) {
    return this.svc.create(body, actor, ip);
  }

  @UseGuards(SuperAdminGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: User,
    @Ip() ip?: string,
  ) {
    return this.svc.update(id, body, actor, ip);
  }

  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip?: string) {
    return this.svc.delete(id, actor, ip);
  }

  // The shortest escalation path of the lot: grant yourself a role.
  @UseGuards(SuperAdminGuard)
  @Post(':roleId/assign/:userId')
  assign(
    @Param('roleId') roleId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: User,
    @Ip() ip?: string,
  ) {
    return this.svc.assignToUser(userId, roleId, actor, ip);
  }
}
