import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { FlutterwaveService } from './flutterwave.service';
import { Payment } from './payment.entity';
import { Wallet } from './wallet.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Wallet]),
    forwardRef(() => DeliveriesModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, FlutterwaveService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
