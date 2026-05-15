import { Module } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';

/**
 * FlutterwaveService extracted into its own module so multiple feature
 * modules (PaymentsModule, EarningsModule, future modules) can import it
 * without creating a circular dependency between PaymentsModule and the
 * modules that PaymentsController's webhook handler needs to call.
 */
@Module({
  providers: [FlutterwaveService],
  exports:   [FlutterwaveService],
})
export class FlutterwaveModule {}
