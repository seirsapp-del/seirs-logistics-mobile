import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { RolesService } from './roles.service';

// Spec V8 — admin role management. Super-admin-only; protected by
// AdminGuard at the route level. UI gates the create/delete actions
// further to super_admin via permission slug 'roles'.
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

  @Post()
  create(@Body() body: { name: string; description?: string; permissions: string[]; badgeColor?: string }) {
    return this.svc.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  @Post(':roleId/assign/:userId')
  assign(@Param('roleId') roleId: string, @Param('userId') userId: string) {
    return this.svc.assignToUser(userId, roleId);
  }
}
