import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxService } from './fx.service';
import { FxRate } from './fx-rate.entity';

@Module({
  imports:   [TypeOrmModule.forFeature([FxRate])],
  providers: [FxService],
  exports:   [FxService],
})
export class FxModule {}
