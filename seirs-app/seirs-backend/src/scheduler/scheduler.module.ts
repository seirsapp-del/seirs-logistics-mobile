import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Delivery } from '../deliveries/delivery.entity';
import { FallbackModule } from '../fallback/fallback.module';
import { FallbackService } from '../fallback/fallback.service';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery]), FallbackModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule implements OnModuleInit {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly fallbackService: FallbackService,
  ) {}

  onModuleInit() {
    this.schedulerService.fallbackService = this.fallbackService;
  }
}
