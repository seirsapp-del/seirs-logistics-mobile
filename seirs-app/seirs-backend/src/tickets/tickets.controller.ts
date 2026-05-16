import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

class CreateTicketDto {
  @IsString() @MaxLength(200)
  subject!: string;

  @IsString() @MaxLength(2000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(50)
  category?: string;

  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional() @IsString() @MaxLength(64)
  tripId?: string;
}

// Customer-facing support ticket surface. Admin queue lives at
// /admin/tickets (admin.controller.ts).
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateTicketDto) {
    return this.tickets.createForUser(user, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: User) {
    return this.tickets.listMine(user.id);
  }
}
