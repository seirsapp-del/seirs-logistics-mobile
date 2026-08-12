import { Controller, Get, Query } from '@nestjs/common';
import { MapsService } from './maps.service';

/**
 * Authenticated Maps proxy. Deliberately NOT marked @Public(): the whole
 * point is that the Google key stops being reachable by anyone who
 * downloads the app. An open proxy would recreate the same billing
 * exposure with extra steps.
 *
 * Address search happens on registration screens too, so anywhere a
 * signed-out user needs lookup, route it through a screen that already
 * has a session, or add a narrow public endpoint with its own limits.
 */
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
