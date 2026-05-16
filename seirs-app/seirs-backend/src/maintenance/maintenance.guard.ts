import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';

// Apply with @UseGuards(MaintenanceGuard) on any endpoint that should be
// blocked while platform-wide maintenance is on. Admin + auth endpoints
// stay reachable so an admin can flip the toggle back off.
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly maintenance: MaintenanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const on = await this.maintenance.isMaintenanceMode();
    if (!on) return true;
    throw new ServiceUnavailableException(
      'SEIRS is temporarily in maintenance mode. Please try again in a few minutes.',
    );
  }
}
