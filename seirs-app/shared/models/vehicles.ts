/**
 * One place that decides what a vehicle is called.
 *
 * Found on the device, 2026-08-29: a single delivery was labelled three
 * different ways inside the customer app. The bookings list called it
 * "Tricycle", the trip screen called it "Keke", and the driver row on
 * that same trip said "motorcycle".
 *
 * The cause was five separate VEHICLE_LABEL maps, one per screen, which
 * had drifted from each other: "Big truck" against "Large truck",
 * "Danfo / Van" against "Danfo / Bus", "Small Truck" against "Small
 * truck". The bookings list had no map at all and printed the raw
 * database enum with its underscore swapped for a space, so
 * `truck_small` would have reached a customer as "truck small".
 *
 * The names are the Nigerian ones deliberately (founder rule): okada,
 * keke and danfo are what people say, and a vehicle picker that says
 * "Tricycle" reads as though it was written for somewhere else.
 *
 * Keys are the backend enum from the canonical taxonomy. Ride ids
 * (okada, keke, car, danfo) are aliased onto the same labels so a ride
 * screen and a package screen cannot disagree either.
 */
export const VEHICLE_LABEL: Record<string, string> = {
  // Backend enum
  bicycle:     'Bicycle / On-foot',
  motorcycle:  'Okada',
  tricycle:    'Keke',
  car:         'Car',
  van:         'Danfo / Van',
  truck_small: 'Small Truck',
  truck_large: 'Large Truck',

  // Ride-side aliases, so both sides of the app say the same word.
  okada: 'Okada',
  keke:  'Keke',
  danfo: 'Danfo / Van',
};

/**
 * Label for a vehicle, falling back to something readable rather than
 * to a raw enum. An unknown key returns the key with underscores
 * removed, which is still better than "truck_small" but should never
 * be reached: add the vehicle above instead.
 */
export function vehicleLabel(type?: string | null): string {
  if (!type) return '';
  return VEHICLE_LABEL[type] ?? String(type).replace(/_/g, ' ');
}
