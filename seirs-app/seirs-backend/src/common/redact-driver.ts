/**
 * What a sender may know about their rider.
 *
 * Found 2026-08-24 against production with an ordinary customer token:
 * the delivery detail routes returned the raw Driver entity with its
 * full User relation attached, so a customer's phone received their
 * rider's bankAccountNumber, bankAccountName, bankCode, homeAddress,
 * dateOfBirth, email, emergency contacts, fcmToken, every KYC document
 * URL, walletBalance, valueLevel, and their account lockout state.
 *
 * Nobody chose to share any of that. Delivery eager-loads driver and
 * Driver eager-loads user, so it went out automatically as a side effect
 * of two decorators, and it would have grown with every column anyone
 * added to either table.
 *
 * It lives here rather than on one service because BOTH the customer
 * delivery route and the business delivery route return the same shape,
 * and two copies of a whitelist drift. One definition, one place to add
 * a field deliberately.
 *
 * The list mirrors the public tracking endpoint, which already had this
 * right, plus the live position: the customer legitimately needs
 * lastLat/lastLng, and having them here lets a client show a last-known
 * fix instead of nothing whenever the socket is quiet.
 *
 * Whitelist, never blacklist. A blacklist leaks the next field anyone
 * adds to the entity, which is exactly how this happened.
 *
 * Drivers are always fully identified to their customer: that is the
 * deal, and the name, photo, plate, vehicle and rating all stay. Being
 * identified is not the same as being exposed.
 */
export function redactDriverForCustomer<T extends { driver?: any }>(d: T): T {
  const dr: any = (d as any)?.driver;
  if (!dr) return d;
  const u = dr.user ?? {};
  (d as any).driver = {
    id:              dr.id,
    vehicleType:     dr.vehicleType ?? null,
    vehiclePlate:    dr.vehiclePlate ?? null,
    vehiclePhotoUrl: dr.vehiclePhotoUrl ?? null,
    // 2026-08-25: was `dr.vehicleDetails ?? null`, which shipped the jsonb
    // blob whole. The vehicle-change flow had been parking a pendingChange
    // object in there carrying R2 URLs for the rider's exterior, interior
    // and plate photos, so every customer tracking a delivery received
    // links to a compliance submission that was still under review. Named
    // fields only, for the same reason the rest of this file is a
    // whitelist: the next thing anyone stores in that column would have
    // gone out too.
    vehicleDetails: dr.vehicleDetails
      ? {
          make:  dr.vehicleDetails.make  ?? null,
          model: dr.vehicleDetails.model ?? null,
          year:  dr.vehicleDetails.year  ?? null,
          color: dr.vehicleDetails.color ?? null,
        }
      : null,
    rating:          dr.rating ?? null,
    totalDeliveries: dr.totalDeliveries ?? 0,
    // Position, so a client can show a last-known fix rather than an
    // empty block when the websocket has nothing to say.
    lastLat:           dr.lastLat ?? null,
    lastLng:           dr.lastLng ?? null,
    locationUpdatedAt: dr.locationUpdatedAt ?? null,
    user: {
      id:           u.id ?? null,
      name:         u.name ?? null,
      firstName:    u.firstName ?? null,
      profilePhoto: u.profilePhoto ?? null,
      // Reachable for this delivery, and nothing more.
      phone:        u.phone ?? null,
    },
  };
  return d;
}
