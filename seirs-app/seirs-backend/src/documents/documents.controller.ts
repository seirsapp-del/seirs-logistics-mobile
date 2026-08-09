import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DocumentsService } from './documents.service';

/**
 * Documents hub endpoints (founder direction 2026-08-09).
 *
 *   GET  /documents/mine              user's official documents, newest first
 *   POST /documents/admin-send/:userId  admin delivers a document (contract,
 *                                       letter, statement, policy) to a user
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.docs.listMine(user.id);
  }

  @UseGuards(AdminGuard)
  @Post('admin-send/:userId')
  adminSend(
    @Param('userId') userId: string,
    @Body() body: { title: string; category?: string; body?: string; fileUrl?: string },
    @CurrentUser() admin: any,
  ) {
    return this.docs.sendToUser(userId, body ?? ({} as any), { id: admin?.id, name: admin?.name });
  }
}
