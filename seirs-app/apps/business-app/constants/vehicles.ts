/**
 * Re-export of the shared vehicle vocabulary.
 *
 * The business app worked this out first, on 2026-08-23 (B-2.3), when
 * the Deliveries list printed the raw backend enum and a run booked as
 * an Okada came back labelled "motorcycle". It kept the only correct
 * copy while the customer app carried five drifting ones and the driver
 * app had none at all, so the same fix had to be found twice more.
 *
 * The map now lives in @seirs/shared/models/vehicles and all three apps
 * read it. This file stays so existing imports keep working, and because
 * the reasoning above is worth not losing.
 */
export { VEHICLE_LABEL, vehicleLabel } from '@seirs/shared/models/vehicles';
