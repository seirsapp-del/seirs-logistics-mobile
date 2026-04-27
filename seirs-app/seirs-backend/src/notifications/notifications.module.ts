import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { FcmService } from './fcm.service';
import { Notification } from './notification.entity';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  providers: [NotificationsService, FcmService],
  controllers: [NotificationsController],
  exports: [NotificationsService, FcmService],
})
export class NotificationsModule {}
