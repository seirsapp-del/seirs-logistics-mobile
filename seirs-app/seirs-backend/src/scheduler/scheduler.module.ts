import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { Delivery } from '../deliveries/delivery.entity';
import { FallbackModule } from '../fallback/fallback.module';
import { FallbackService } from '../fallback/fallback.service';
import { SupportModule } from '../support/support.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { SupportService } from '../support/support.service';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery]), FallbackModule, SupportModule, DeliveriesModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule implements OnModuleInit {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly fallbackService: FallbackService,
    private readonly supportService:  SupportService,
    private readonly deliveriesService: DeliveriesService,
  ) {}

  onModuleInit() {
    this.schedulerService.fallbackService = this.fallbackService;
    this.schedulerService.supportService  = this.supportService;
    this.schedulerService.deliveriesService = this.deliveriesService;
  }
}
