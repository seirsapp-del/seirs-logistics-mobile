import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Google Maps proxy (security review 2026-08-12).
 *
 * The apps used to call Directions, Places and Geocoding directly with a
 * key compiled into their source. Any key shipped inside an app can be
 * pulled back out of the installed package, and Google's "restrict this
 * key to my Android app" protection does not cover those three web
 * services, so the key had to be left unrestricted. Anyone who extracted
 * it could run their own traffic and Google would bill SEIRS.
 *
 * Now the key lives only here, in server configuration. The apps call
 * our own authenticated endpoints, so the worst an attacker can do is
 * create a SEIRS account, which we can see and disable.
 *
 * Responses are returned in Google's own shape. That was deliberate: it
 * kept the change in ten app files down to swapping a URL, which is far
 * less likely to introduce a bug than reshaping every caller.
 *
 * NOTE: this is separate from the Maps SDK key in app.json and
 * google-services.json, which draws the map itself. That one is
 * necessarily inside the app, and is protected by package-name plus
 * signing-certificate restrictions in the Google Cloud console.
 */

const GOOGLE = 'https://maps.googleapis.com/maps/api';

/** Reject absurd input early rather than paying Google to reject it. */
const MAX_INPUT_LEN = 200;

/**
 * Geocoding cache.
 *
 * Every call in this file is billed per request, and geocoding is the
 * one that repeats: the same pickup address is booked again and again,
 * the same partner store is looked up by every sender near it, and a
 * driver reverse-geocodes from the same junction all day. Paying Google
 * twice for an answer that cannot have changed is money for nothing.
 *
 * In-process rather than a table: production runs with `synchronize`
 * off, so a cache entity would need a migration to exist at all, and a
 * cold cache after a restart is a slow start rather than a bug. Moving
 * this to Postgres later is a drop-in change behind the same two helpers.
 */
const CACHE_MAX     = 5_000;
/** A street's coordinates do not move. */
const CACHE_TTL_MS  = 30 * 24 * 60 * 60 * 1000;
/** A miss might be a typo today and a real address next month. */
const MISS_TTL_MS   = 60 * 60 * 1000;
/**
 * Reverse lookups are keyed on coordinates rounded to 4dp, about 11m.
 * Raw coordinates never repeat, so an unrounded key would cache nothing;
 * at 11m the answer to "what road is this" is the same answer.
 */
const REVERSE_DP    = 4;

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly apiKey: string;

  constructor(private readonly cfg: ConfigService) {
    this.apiKey = this.cfg.get<string>('GOOGLE_MAPS_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.error(
        'GOOGLE_MAPS_API_KEY not set: address search and route drawing will not work in any app.',
      );
    }
  }

  /** key -> { value, expires }. Insertion-ordered, so the oldest key is first. */
  private readonly cache = new Map<string, { value: any; expires: number }>();

  private cacheGet(key: string): any | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) { this.cache.delete(key); return undefined; }
    // Re-insert so the hottest keys are the last to be evicted.
    this.cache.delete(key);
    this.cache.set(key, hit);
    return hit.value;
  }

  private cacheSet(key: string, value: any, ttl: number) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expires: Date.now() + ttl });
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Maps lookup is not configured on the server.');
    }
  }

  private async call(path: string, params: Record<string, string | undefined>) {
    this.assertConfigured();
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    qs.set('key', this.apiKey);

    try {
      const res  = await fetch(`${GOOGLE}/${path}?${qs.toString()}`);
      const json = await res.json();
      // Surface Google's own status to the caller: the apps already
      // branch on predictions/results being empty, and hiding a
      // REQUEST_DENIED behind a generic error made the last key problem
      // much harder to diagnose than it needed to be.
      if (json?.status && !['OK', 'ZERO_RESULTS'].includes(json.status)) {
        this.logger.warn(`Google ${path} returned ${json.status}: ${json.error_message ?? 'no message'}`);
      }
      return json;
    } catch (err: any) {
      this.logger.error(`Google ${path} call failed: ${err?.message}`);
      throw new ServiceUnavailableException('Maps lookup failed. Try again.');
    }
  }

  /** Road route between two points, optionally through waypoints. */
  directions(params: {
    origin: string; destination: string; mode?: string; waypoints?: string;
  }) {
    if (!params.origin || !params.destination) {
      throw new BadRequestException('origin and destination are required.');
    }
    return this.call('directions/json', {
      origin:      params.origin,
      destination: params.destination,
      mode:        params.mode ?? 'driving',
      waypoints:   params.waypoints,
    });
  }

  /** Address suggestions as the user types. */
  placesAutocomplete(params: {
    input: string; components?: string; location?: string; radius?: string; types?: string;
    sessiontoken?: string;
  }) {
    const input = (params.input ?? '').trim();
    if (!input) throw new BadRequestException('input is required.');
    if (input.length > MAX_INPUT_LEN) throw new BadRequestException('input is too long.');
    return this.call('place/autocomplete/json', {
      input,
      components:   params.components,
      location:     params.location,
      radius:       params.radius,
      types:        params.types,
      sessiontoken: params.sessiontoken,
    });
  }

  /**
   * Full detail (coordinates, formatted address) for a chosen suggestion.
   *
   * Deliberately NOT cached, even though a place_id's coordinates never
   * change. Autocomplete plus Details sharing a session token is billed
   * by Google as one session; serving Details from cache breaks the
   * session, and the preceding autocomplete keystrokes then bill
   * individually. Caching here would cost more than it saves.
   */
  placeDetails(params: { placeId: string; fields?: string; sessiontoken?: string }) {
    if (!params.placeId) throw new BadRequestException('placeId is required.');
    return this.call('place/details/json', {
      place_id:     params.placeId,
      fields:       params.fields ?? 'geometry,formatted_address',
      sessiontoken: params.sessiontoken,
    });
  }

  /**
   * Forward geocode (address to coordinates) or reverse (coordinates to
   * address), served from cache when we have already paid for the answer.
   *
   * Only OK and ZERO_RESULTS are cached. Anything else is a failure on
   * Google's side or ours, and caching a REQUEST_DENIED would turn a
   * misconfigured key into an outage that outlives the fix.
   */
  async geocode(params: { address?: string; latlng?: string }) {
    if (!params.address && !params.latlng) {
      throw new BadRequestException('address or latlng is required.');
    }

    const key = this.geocodeKey(params);
    const hit = this.cacheGet(key);
    if (hit !== undefined) return hit;

    const json = await this.call('geocode/json', {
      address: params.address,
      latlng:  params.latlng,
    });

    if (json?.status === 'OK')                this.cacheSet(key, json, CACHE_TTL_MS);
    else if (json?.status === 'ZERO_RESULTS') this.cacheSet(key, json, MISS_TTL_MS);

    return json;
  }

  /** Address keys are trimmed and lower-cased; coordinate keys are rounded. */
  private geocodeKey(params: { address?: string; latlng?: string }) {
    if (params.address) return `g:a:${params.address.trim().toLowerCase()}`;
    const rounded = (params.latlng ?? '')
      .split(',')
      .map(part => {
        const n = Number(part.trim());
        return Number.isFinite(n) ? n.toFixed(REVERSE_DP) : part.trim();
      })
      .join(',');
    return `g:l:${rounded}`;
  }
}
