import { Controller, Get } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { Public } from '../common/decorators/public.decorator';

// Public status endpoint so the mobile apps can show a maintenance
// banner before the user tries an action and gets a 503. Cheap to poll
// (cached for 10s in MaintenanceService).
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Public()
  @Get('status')
  async status() {
    const on = await this.maintenance.isMaintenanceMode();
    return {
      maintenanceMode: on,
      message: on
        ? 'SEIRS is temporarily in maintenance mode. New trips and payments are paused.'
        : null,
    };
  }
}
