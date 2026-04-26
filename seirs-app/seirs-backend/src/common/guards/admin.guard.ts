import { Injectable, ForbiddenException, CanActivate, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../users/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required.');
    }
    return true;
  }
}
