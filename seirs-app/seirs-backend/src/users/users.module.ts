import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { ArchivedUser } from './archived-user.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([User, ArchivedUser])],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}
