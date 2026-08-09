import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Delivery } from '../deliveries/delivery.entity';
import { FallbackModule } from '../fallback/fallback.module';
import { FallbackService } from '../fallback/fallback.service';
import { SupportModule } from '../support/support.module';
import { SupportService } from '../support/support.service';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery]), FallbackModule, SupportModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule implements OnModuleInit {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly fallbackService: FallbackService,
    private readonly supportService:  SupportService,
  ) {}

  onModuleInit() {
    this.schedulerService.fallbackService = this.fallbackService;
    this.schedulerService.supportService  = this.supportService;
  }
}
