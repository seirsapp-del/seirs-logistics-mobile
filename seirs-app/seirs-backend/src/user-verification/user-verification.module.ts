import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityVerification } from './user-verification.entity';
import { UserVerificationService } from './user-verification.service';
import { UserVerificationController } from './user-verification.controller';
import { AdminUserVerificationController } from './admin-user-verification.controller';
import { User } from '../users/user.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([IdentityVerification, User])],
  controllers: [UserVerificationController, AdminUserVerificationController],
  providers:   [UserVerificationService],
  exports:     [UserVerificationService],
})
export class UserVerificationModule {}
