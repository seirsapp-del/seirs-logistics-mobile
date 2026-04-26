import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
