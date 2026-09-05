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

/**
 * What a passenger may know about the vehicle they are meeting.
 *
 * A Travel Buddy trip carried the vehicle TYPE and nothing else, so the
 * browse card said "Okada" and the passenger went to the park at 5am
 * looking for one of the two hundred okadas parked there. Type is not an
 * identification. Plate, colour, make and model are, and the driver row
 * has held all four the whole time.
 *
 * This is a safety control before it is a convenience: a passenger who
 * cannot pick their vehicle out of a park cannot tell it apart from a
 * stranger offering a lift, and "get on, I am your SEIRS rider" is the
 * cheapest attack there is.
 *
 * Whitelist, never blacklist, for the reason written at the top of this
 * file: the driver row also holds bank details, home address, date of
 * birth, emergency contacts, the push token and the lockout state, and a
 * blacklist ships whichever of those someone adds next. Six named
 * fields, all of them about the machine rather than the person.
 *
 * make/model/colour live inside the vehicleDetails jsonb, so they are
 * read out by name here too: that column has already carried a pending
 * compliance submission once, and spreading it whole would ship it again.
 */
export function vehicleIdentityForPassenger(dr: any) {
  const v = dr?.vehicleDetails ?? {};
  return {
    vehicleType:     dr?.vehicleType  ?? null,
    vehiclePlate:    dr?.vehiclePlate ?? null,
    // The strongest identifier of the lot: the passenger compares a
    // photo to what is in front of them instead of reading a plate in
    // the dark.
    vehiclePhotoUrl: dr?.vehiclePhotoUrl ?? null,
    vehicleMake:     v.make  ?? null,
    vehicleModel:    v.model ?? null,
    vehicleColor:    v.color ?? null,
  };
}

/**
 * What a STRANGER may see about a driver, before any agreement exists.
 *
 * vehicleIdentityForPassenger is correct and stays: someone standing in
 * a motor park at 5am has to pick the right vehicle out of the row. But
 * it was being called on the public browse endpoint, so anyone who ran a
 * search got, for every declared trip, the driver's full name, their
 * plate, a photograph of their vehicle, the exact address they would be
 * standing at and the exact minute (found 2026-09-04). That is a
 * stalking kit, and the founder's own reason for keeping trip listings
 * off the home screen was driver safety.
 *
 * So browsing sees a person and a class of vehicle, enough to choose.
 * Plate, photograph, colour and model appear once the driver has
 * accepted that specific passenger, which is the moment the two of them
 * have actually agreed to meet.
 */
export function driverForBrowsing(dr: any) {
  /*
   * REVERSED by the founder, 2026-09-05: "I think we should actually
   * show it, for the safety of the customer and the business, the
   * profile picture and the full detail, that is what the driver signed
   * up to."
   *
   * The reasoning above still stands about ONE pairing, and only one:
   * a plate plus an exact address plus an exact minute is a stakeout.
   * Everything else on this list is what a passenger needs in order to
   * decide whether to get into a stranger's car at night, and what a
   * shop needs before handing over goods. Withholding a face made the
   * driver safer and the customer blinder, and the customer is the one
   * standing at the roadside.
   *
   * So: a full name, a photograph, a rating, a delivery count and the
   * make, model and colour of the car. The PLATE still waits for the
   * acceptance, and so does the exact boarding spot, because those two
   * are what turn a listing into a place to lie in wait.
   */
  const v = dr?.vehicleDetails ?? {};
  return {
    name:            dr?.user?.name ?? 'Driver',
    profilePhoto:    dr?.user?.profilePhoto ?? null,
    rating:          dr?.rating ?? null,
    totalDeliveries: dr?.totalDeliveries ?? 0,
    vehicleType:     dr?.vehicleType ?? null,
    vehicleMake:     v.make  ?? null,
    vehicleModel:    v.model ?? null,
    vehicleColor:    v.color ?? null,
    /**
     * The plate, and only the plate, is still to come. The card uses
     * this to say so plainly rather than rendering "no plate listed",
     * which reads as a driver who has not done their paperwork.
     */
    identityRevealed: false as const,
  };
}
