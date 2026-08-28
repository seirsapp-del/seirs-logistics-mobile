import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/user.entity';
import { ZonesService, type ZoneWriteDto } from './zones.service';
import type { ZonePoint } from './zone-geometry';
import {
  ZONE_PERMISSION_CLOSE, ZONE_PERMISSION_PRICE, permsSatisfy,
} from './zones.permissions';

function pointFrom(body: any): ZonePoint {
  if (!body || typeof body !== 'object') return {};
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng);
  const point: ZonePoint = {};
  if (Number.isFinite(lat) && Number.isFinite(lng)) point.coords = { latitude: lat, longitude: lng };
  if (body.stateCode) point.stateCode = String(body.stateCode).toUpperCase() as any;
  return point;
}

function instantFrom(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Zone administration.
 *
 * AdminGuard is the front door and proves the caller is staff. It is NOT
 * the authorization: every write re-checks THIS actor against THIS row
 * inside the service, because "is a logged-in admin" and "may close
 * Ikeja tonight" are different questions and only the second one keeps
 * anybody safe. Reads stay on AdminGuard alone so ops can see what is
 * live without holding the power to change it.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/zones')
export class ZonesAdminController {
  constructor(private readonly svc: ZonesService) {}

  // Declared above ':id' so these literal paths are not swallowed by it.
  @Get('options')
  options() {
    return this.svc.shapeOptions();
  }

  /**
   * GET /api/v1/admin/zones/map
   *
   * Published zones, shaped for drawing on the operations map.
   *
   * A closure could be declared here and the screen an ops manager
   * actually watches showed nothing: the ops map has layers for online
   * drivers, offline drivers, requests, routes, stores and demand, and
   * had none for zones (found 2026-08-28). So an area could be closed
   * and the live view of the platform would look exactly as it did
   * before, which defeats the point of being able to close one.
   *
   * Only published zones, because a draft is a plan rather than a fact.
   * Circles and polygons carry geometry the map can draw directly;
   * state and geozone shapes are returned with their code so the client
   * can label them without this endpoint shipping a boundary file.
   */
  @Get('map')
  async mapLayer() {
    const zones = await this.svc.publishedZones();
    return zones.map((z) => ({
      id:       z.id,
      name:     z.name,
      status:   z.status,
      reason:   z.reason ?? null,
      colour:   z.colour ?? null,
      priority: z.priority,
      shape:    z.shape,
      /**
       * Red covers every blocking state, because at a glance the
       * question is "can we work here" and the detail belongs in the
       * panel. The spec's palette: blue under 1.0, green open, amber
       * surcharged, red blocking.
       */
      blocking: z.status === 'closed' || z.status === 'no_pickup' || z.status === 'no_dropoff',
      effects:  z.effects ?? null,
      active:   z.active ?? null,
    }));
  }

  /**
   * What the signed-in admin may actually do here, so the page can
   * disable a control instead of offering it and then refusing the save.
   * A fully enabled screen whose every action 403s is its own bug.
   */
  @Get('permissions')
  async permissions(@CurrentUser() user: User) {
    const held = await this.svc.permissionsOf(user as any);
    return {
      canClose: permsSatisfy(held, [ZONE_PERMISSION_CLOSE]),
      canPrice: permsSatisfy(held, [ZONE_PERMISSION_PRICE]),
    };
  }

  /**
   * Dry-run a job against the live zones. Exists so a closure can be
   * checked before it reaches a sender rather than after.
   */
  @Post('preview')
  preview(@Body() body: any) {
    return this.svc.preview({
      pickup:  pointFrom(body?.pickup),
      dropoff: body?.dropoff ? pointFrom(body.dropoff) : null,
      vehicleType: body?.vehicleType ?? null,
      at: instantFrom(body?.at),
    });
  }

  @Get()
  list() {
    return this.svc.listAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: ZoneWriteDto) {
    return this.svc.create(user as any, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: ZoneWriteDto) {
    return this.svc.update(user as any, id, body);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { published?: boolean }) {
    return this.svc.setPublished(user as any, id, body?.published !== false);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user as any, id);
  }
}

/**
 * The app-facing half.
 *
 * Signed in, not public. It answers "can I send from here" and nothing
 * else: no multipliers, no surcharge percentages, no fuel overrides. The
 * public rate card leaked exactly that sort of configuration once and
 * the fix was to stop serving it, so this returns a verdict and a
 * sentence and keeps the numbers on the server.
 */
@UseGuards(JwtAuthGuard)
@Controller('zones')
export class ZonesController {
  constructor(private readonly svc: ZonesService) {}

  /**
   * `at` is the instant that matters, and for a scheduled booking that is
   * the scheduled time rather than now. Warning someone at 2pm that
   * their 7pm pickup will be refused is the whole point of letting the
   * app ask early.
   */
  @Get('check')
  check(
    @Query('latitude')  latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('stateCode') stateCode?: string,
    @Query('end')       end?: string,
    @Query('at')        at?: string,
  ) {
    const point = pointFrom({ latitude, longitude, stateCode });
    return this.svc.checkPoint(point, instantFrom(at), end === 'dropoff' ? 'dropoff' : 'pickup');
  }
}
