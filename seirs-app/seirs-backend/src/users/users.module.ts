import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { ArchivedUser } from './archived-user.entity';
import { UserProfileAudit } from './user-profile-audit.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([User, ArchivedUser, UserProfileAudit])],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}
