/**
 * What Nigerians call these vehicles, for anything a user reads.
 *
 * The enum values are the database's business, not the passenger's. A
 * refusal that reads "motorcycle cannot take large luggage" is the
 * schema talking; the rider outside is on an okada (device QA
 * 2026-08-29, founder watching).
 *
 * MIRRORS shared/models/vehicles.ts, deliberately and unhappily. That
 * file exists because five per-screen copies of this map had drifted
 * apart ("Big truck" against "Large truck", "Danfo / Van" against
 * "Danfo / Bus"), and the backend is a separate package that cannot
 * resolve the import. So the values here are copied EXACTLY rather than
 * rewritten: a vehicle that is called one thing on the quote screen and
 * another in the error message reads as two different products. If you
 * change one, change the other.
 *
 * This also replaced a sixth copy that had been inlined inside
 * deliveries.service.ts.
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

  // Ride-side aliases, so both sides say the same word.
  okada: 'Okada',
  keke:  'Keke',
  danfo: 'Danfo / Van',
};

/** The Nigerian name, as the apps write it. */
export function vehicleLabel(type: string | null | undefined): string {
  const key = String(type ?? '').toLowerCase();
  return VEHICLE_LABEL[key] ?? key.replace(/_/g, ' ');
}

/** The same name mid-sentence, where Title Case reads as shouting. */
export function vehicleLabelLower(type: string | null | undefined): string {
  return vehicleLabel(type).toLowerCase();
}

/**
 * The name with its article, because "An car" is what you get from
 * hard-coding one. Reads the label, not the enum key: "okada" takes an,
 * "car" takes a.
 */
export function aVehicle(type: string | null | undefined): string {
  const label = vehicleLabelLower(type);
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
}
