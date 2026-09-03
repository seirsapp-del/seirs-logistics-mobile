import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { DocumentsModule } from '../documents/documents.module';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { ArchivedUser } from './archived-user.entity';
import { UserProfileAudit } from './user-profile-audit.entity';
import { SavedAddress } from '../addresses/saved-address.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([User, ArchivedUser, UserProfileAudit, SavedAddress]),
                DocumentsModule],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}
