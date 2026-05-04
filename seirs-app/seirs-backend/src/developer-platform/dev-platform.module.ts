import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevPlatformService } from './dev-platform.service';
import { DevPlatformController } from './dev-platform.controller';
import { ApiKey } from './api-key.entity';
import { WebhookEndpoint, WebhookDelivery } from './webhook.entity';

@Module({
  imports:     [TypeOrmModule.forFeature([ApiKey, WebhookEndpoint, WebhookDelivery])],
  controllers: [DevPlatformController],
  providers:   [DevPlatformService],
  exports:     [DevPlatformService],
})
export class DevPlatformModule {}
