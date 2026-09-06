import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { BusinessService } from './business.service';

/**
 * Recurring runs for ANY signed-in account (founder 2026-09-06: "add the
 * recurring thing to the customer app as well").
 *
 * The business routes under /business/recurring-templates stay for the
 * business app; these are the same four operations without the
 * BusinessAccountGuard, so a customer can keep a Monday run too. The
 * payload's `kind` says which booking path the cron uses when the run
 * comes due. Nothing here charges anything: a run is created as Awaiting
 * payment and the owner pays it through checkout.
 */
@UseGuards(JwtAuthGuard)
@Controller('recurring-templates')
export class RecurringController {
  constructor(private readonly svc: BusinessService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.svc.listRecurringTemplates(user.id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.createRecurringTemplate(user.id, body);
  }

  @Patch(':id')
  toggle(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.svc.toggleRecurringTemplate(user.id, id, !!body?.isActive);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.deleteRecurringTemplate(user.id, id);
  }
}
