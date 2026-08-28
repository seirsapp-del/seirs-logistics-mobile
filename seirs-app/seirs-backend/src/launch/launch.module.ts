import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntry } from '../admin/audit-log.entity';
import { User } from '../users/user.entity';
import { LaunchController } from './launch.controller';
import { LaunchResetService } from './launch-reset.service';

/**
 * Launch reset: its own module, deliberately.
 *
 * It could have been three more methods on AdminService, and that is
 * the reason not to. This is the one operation on the platform that
 * deletes accounts in bulk, and it needs to be reviewable on its own,
 * guarded on its own, and impossible to reach by accident from a
 * neighbouring endpoint.
 *
 * Only two repositories are registered. Everything else goes through
 * the injected DataSource as ordered raw SQL, because the deletion
 * order is the point of the feature: forty-odd tables, several of them
 * linked by plain id columns with no foreign key, have to go in a
 * specific sequence. Expressing that as forty repository imports would
 * hide the ordering rather than state it. It lives in one readable
 * TARGETS table in the service instead.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntry, User])],
  controllers: [LaunchController],
  providers: [LaunchResetService],
  exports: [LaunchResetService],
})
export class LaunchModule {}
