import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MapsService } from './maps.service';

/**
 * Authenticated Maps proxy.
 *
 * The guard below is the entire point. Moving the Google key off the
 * phone only helps if the replacement is not itself free to use: an
 * open proxy is the same billing exposure with an extra hop, and a
 * friendlier one, since the attacker no longer has to unpack an APK to
 * find it. Abuse now costs a SEIRS account we can see and disable.
 *
 * This codebase guards per controller rather than globally, so the
 * class-level guard is load-bearing. Shipped without it on 2026-08-12
 * and caught in production the next morning: /maps/geocode answered
 * anonymous callers with live data for several hours.
 *
 * Address search also happens on registration screens, before a session
 * exists. Those still call Google directly today; when they move here
 * they need a narrow public endpoint with its own rate limit, not a
 * blanket exemption on this controller.
 */
@UseGuards(JwtAuthGuard)
@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  // GET /api/v1/maps/directions?origin=6.5,3.3&destination=6.6,3.4&mode=driving
  @Get('directions')
  directions(
    @Query('origin')      origin: string,
    @Query('destination') destination: string,
    @Query('mode')        mode?: string,
    @Query('waypoints')   waypoints?: string,
  ) {
    return this.maps.directions({ origin, destination, mode, waypoints });
  }

  // GET /api/v1/maps/places/autocomplete?input=Admiralty&components=country:ng
  @Get('places/autocomplete')
  autocomplete(
    @Query('input')        input: string,
    @Query('components')   components?: string,
    @Query('location')     location?: string,
    @Query('radius')       radius?: string,
    @Query('types')        types?: string,
    @Query('sessiontoken') sessiontoken?: string,
  ) {
    return this.maps.placesAutocomplete({ input, components, location, radius, types, sessiontoken });
  }

  // GET /api/v1/maps/places/details?placeId=ChIJ...
  @Get('places/details')
  details(
    @Query('placeId')      placeId: string,
    @Query('fields')       fields?: string,
    @Query('sessiontoken') sessiontoken?: string,
  ) {
    return this.maps.placeDetails({ placeId, fields, sessiontoken });
  }

  // GET /api/v1/maps/geocode?latlng=6.5,3.3   (or ?address=15 Admiralty Way)
  @Get('geocode')
  geocode(
    @Query('address') address?: string,
    @Query('latlng')  latlng?: string,
  ) {
    return this.maps.geocode({ address, latlng });
  }
}
