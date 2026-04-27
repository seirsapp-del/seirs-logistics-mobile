import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TrackingGateway } from './tracking.gateway';
import { RedisService } from './redis.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [TrackingGateway, RedisService],
  exports:   [TrackingGateway, RedisService],
})
export class TrackingModule {}
