import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { Role } from './role.entity';
import { AuditLogEntry } from '../admin/audit-log.entity';
import { User } from '../users/user.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([Role, User, AuditLogEntry])],
  controllers: [RolesController],
  providers:   [RolesService],
  exports:     [RolesService],
})
export class RolesModule {}
