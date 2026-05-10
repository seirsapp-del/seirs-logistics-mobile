import {
  Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe,
  Post, Query, UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser }  from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  // GET /api/v1/chats/:deliveryId/messages?limit=100
  // List messages for the delivery thread. Marks the other party's
  // unread messages as read as a side effect.
  @Get(':deliveryId/messages')
  list(
    @Param('deliveryId') deliveryId: string,
    @CurrentUser()       user:       User,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.svc.list(deliveryId, user.id, limit);
  }

  // POST /api/v1/chats/:deliveryId/messages  { body: string }
  @Post(':deliveryId/messages')
  send(
    @Param('deliveryId') deliveryId: string,
    @CurrentUser()       user:       User,
    @Body()              body:       { body: string },
  ) {
    return this.svc.send(deliveryId, user, body?.body);
  }

  // GET /api/v1/chats/unread-count — used by the Messages tab badge.
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    const count = await this.svc.unreadCount(user.id);
    return { count };
  }

  // GET /api/v1/chats — list the user's conversations (one per delivery
  // they're part of, with the last message + unread count + other party).
  // Drives the Messages tab list on both customer and driver apps.
  @Get()
  conversations(@CurrentUser() user: User) {
    return this.svc.listConversations(user.id);
  }
}
