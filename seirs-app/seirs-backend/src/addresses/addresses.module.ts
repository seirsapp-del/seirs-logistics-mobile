import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { SavedAddress } from './saved-address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavedAddress])],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
