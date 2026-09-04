import {
  Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { SupportService } from './support.service';
import { TicketStatus, TicketTopic } from './support-ticket.entity';

@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  // ── User endpoints ─────────────────────────────────────────────────

  // POST /api/v1/support/tickets
  @Post('tickets')
  create(
    @CurrentUser() user: User,
    @Body() body: {
      topic:            TicketTopic;
      subject:          string;
      firstMessage:     string;
      linkedDeliveryId?: string | null;
    },
  ) {
    return this.svc.create(user.id, body);
  }

  // GET /api/v1/support/tickets  (mine)
  @Get('tickets')
  listMine(
    @CurrentUser() user: User,
    @Query('status') status?: TicketStatus,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.svc.listMine(user.id, { status, limit });
  }

  // GET /api/v1/support/tickets/:id (owner or agent)
  @Get('tickets/:id')
  getThread(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.getThread(id, user);
  }

  // POST /api/v1/support/tickets/:id/messages
  @Post('tickets/:id/messages')
  reply(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { body: string },
  ) {
    return this.svc.userReply(id, user, body?.body);
  }

  // ── Agent endpoints ────────────────────────────────────────────────

  // GET /api/v1/support/queue?status=&topic=&accountType=&limit=
  @Get('queue')
  queue(
    @CurrentUser() user: User,
    @Query('status')      status?:      TicketStatus,
    @Query('topic')       topic?:       TicketTopic,
    @Query('accountType') accountType?: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
    // Sorting is a server concern: it decides WHICH rows a page contains,
    // not merely their arrangement, the moment there is more than one page.
    @Query('sort')  sort?: 'recent' | 'waiting',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('q')          q?: string,
    @Query('unassigned') unassigned?: string,
    @Query('from')       from?: string,
    @Query('to')         to?: string,
  ) {
    return this.svc.listQueue(user, {
      status, topic, accountType, limit, sort, page, q,
      // Query strings carry text, so "false" would be truthy as a value.
      unassigned: unassigned === 'true' || unassigned === '1',
      from, to,
    });
  }

  // POST /api/v1/support/tickets/:id/agent-reply
  @Post('tickets/:id/agent-reply')
  agentReply(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { body: string },
  ) {
    return this.svc.agentReply(id, user, body?.body);
  }

  // PATCH /api/v1/support/tickets/:id/status  { status }
  @Patch('tickets/:id/status')
  setStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { status: TicketStatus },
  ) {
    return this.svc.setStatus(id, user, body?.status);
  }
}
