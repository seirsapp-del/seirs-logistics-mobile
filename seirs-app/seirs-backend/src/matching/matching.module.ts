import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { DriversModule } from '../drivers/drivers.module';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [DriversModule, FeesModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
