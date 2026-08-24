/**
 * Canonical vehicle vocabulary for the business app.
 *
 * Lifted out of send-package.tsx on 2026-08-23 (B-2.3): the booking wizard
 * held the only copy, so the Deliveries list printed the raw backend enum
 * and a run booked as an Okada came back labelled "motorcycle". A sender
 * should read the same word on the list that they tapped in the wizard.
 *
 * Keys are the backend enum (see the shared VehicleType union). Nigerian
 * vocabulary is the house standard: okada, keke, danfo.
 */
export const VEHICLE_LABEL: Record<string, string> = {
  bicycle: 'Bicycle / On-foot', motorcycle: 'Okada', tricycle: 'Keke',
  car: 'Car', van: 'Danfo / Van', truck_small: 'Small Truck', truck_large: 'Large Truck',
};

/**
 * Display helper for anything that renders a stored vehicleType. Falls back
 * to the de-underscored enum so an enum added server-side still reads as
 * words rather than vanishing.
 */
export function vehicleLabel(v?: string | null): string {
  if (!v) return '';
  return VEHICLE_LABEL[v] ?? v.replace(/_/g, ' ');
}
