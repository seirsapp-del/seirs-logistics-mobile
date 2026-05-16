import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FlutterwaveModule } from './flutterwave.module';
import { Payment } from './payment.entity';
import { Wallet } from './wallet.entity';
import { SavedCard } from './saved-card.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { EarningsModule } from '../earnings/earnings.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Wallet, SavedCard]),
    FlutterwaveModule,
    forwardRef(() => DeliveriesModule),
    EarningsModule,
    LoyaltyModule,
    MaintenanceModule,
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
  exports:     [PaymentsService, FlutterwaveModule],
})
export class PaymentsModule {}
