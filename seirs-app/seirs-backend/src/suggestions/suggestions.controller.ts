import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { SuggestionCategory, SuggestionStatus } from './suggestion.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller()
export class SuggestionsController {
  constructor(private readonly svc: SuggestionsService) {}

  // ── Customer + driver ─────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('suggestions')
  submit(
    @CurrentUser() user: User,
    @Body() body: { subject: string; body: string; category?: SuggestionCategory },
  ) {
    return this.svc.submit(user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  list(
    @Query('page',  new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status')   status?:   SuggestionStatus,
    @Query('category') category?: SuggestionCategory,
  ) {
    return this.svc.list({ page, status, category });
  }

  @UseGuards(JwtAuthGuard)
  @Post('suggestions/:id/vote')
  vote(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.vote(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('suggestions/:id/unvote')
  unvote(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.unvote(user.id, id);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/suggestions')
  adminList(
    @Query('page',  new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status')   status?:   SuggestionStatus,
    @Query('category') category?: SuggestionCategory,
  ) {
    return this.svc.list({ page, status, category });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/suggestions/:id')
  adminUpdate(
    @Param('id') id: string,
    @Body() body: { status?: SuggestionStatus; adminReply?: string },
  ) {
    return this.svc.updateStatus(id, body);
  }
}
