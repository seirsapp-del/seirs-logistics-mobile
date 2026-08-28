/**
 * One plain-English vocabulary for the whole dashboard.
 *
 * The tables were rendering raw database values at people. A delivery
 * read "in_transit", a driver read "pending", a return read
 * "awaiting_decision". Those are column values, and the person reading
 * them is a support agent on their second day, not the engineer who
 * named them. `String(s).replace('_',' ')` was the closest thing to a
 * fix anywhere, which turns in_transit into "in transit" and picked_up
 * into "picked up" and still leaves the reader to guess whether a
 * "pending" driver is waiting for approval or waiting for a job.
 *
 * Two rules here:
 *   1. Say what is happening, in words somebody would say out loud.
 *      "On the way", not "in transit".
 *   2. Disambiguate across contexts. "pending" means a different thing
 *      on a delivery than on a driver, so they get different labels
 *      rather than one shared lie.
 *
 * `hint` is the longer sentence, used as a tooltip and in empty states,
 * for the cases where the label alone still leaves a question.
 */

export interface Label {
  label: string;
  hint?: string;
}

const DELIVERY: Record<string, Label> = {
  pending:     { label: 'Looking for a rider', hint: 'Booked and paid for, waiting to be matched with a rider.' },
  assigned:    { label: 'Rider assigned',      hint: 'A rider has accepted and is on their way to collect it.' },
  picked_up:   { label: 'Collected',           hint: 'The rider has the package.' },
  in_transit:  { label: 'On the way',          hint: 'On the road to the drop-off.' },
  delivered:   { label: 'Delivered',           hint: 'Handed over and confirmed.' },
  failed:      { label: 'Could not deliver',   hint: 'The rider could not complete it. The reason is on the row.' },
  cancelled:   { label: 'Cancelled',           hint: 'Called off before completion.' },
  disputed:    { label: 'Problem reported',    hint: 'Somebody on this job has raised an issue.' },
  returning:   { label: 'Going back',          hint: 'On its way back to the sender.' },
  returned:    { label: 'Returned to sender' },
};

const DRIVER: Record<string, Label> = {
  pending:   { label: 'Waiting for approval', hint: 'Signed up and cannot take jobs until somebody approves them.' },
  approved:  { label: 'Approved',             hint: 'Can receive dispatch offers.' },
  suspended: { label: 'Suspended',            hint: 'Blocked from new offers. Any trip already running finishes.' },
  rejected:  { label: 'Rejected',             hint: 'Application turned down. Can be reversed with Reactivate.' },
};

const RETURN: Record<string, Label> = {
  none:              { label: 'No return' },
  requested:         { label: 'Return requested' },
  awaiting_decision: { label: 'Waiting on the sender' },
  approved:          { label: 'Return approved' },
  in_progress:       { label: 'Going back' },
  completed:         { label: 'Back with the sender' },
  declined:          { label: 'Return declined' },
};

const ROLE: Record<string, Label> = {
  customer: { label: 'Customer' },
  business: { label: 'Business' },
  partner:  { label: 'Partner store' },
  driver:   { label: 'Rider' },
  admin:    { label: 'Staff' },
};

const ZONE: Record<string, Label> = {
  open:            { label: 'Open',            hint: 'Normal service. Nothing is restricted here.' },
  surcharged:      { label: 'Costs more here', hint: 'Service runs, at an adjusted price.' },
  closed:          { label: 'Closed',          hint: 'SEIRS will not take any job starting or ending here.' },
  no_pickup:       { label: 'No collections',  hint: 'Nothing can be collected here. Drop-offs still work.' },
  no_dropoff:      { label: 'No drop-offs',    hint: 'Nothing can be delivered here. Collections still work.' },
};

/**
 * Travel Buddy seats. A passenger is a person, so "no_show" reading as
 * "no show" on an ops board understates it: somebody paid, did not
 * arrive, and forfeited the fare, and the desk is deciding whether that
 * is fair.
 */
const SEAT: Record<string, Label> = {
  requested: { label: 'Waiting on the driver', hint: 'The passenger asked for a seat; the driver has not accepted yet.' },
  accepted:  { label: 'Driver said yes',       hint: 'Accepted, and the passenger now has to pay before the seat is held.' },
  declined:  { label: 'Driver said no' },
  booked:    { label: 'Seat paid for',         hint: 'Paid and held. The passenger is expected at the boarding point.' },
  boarded:   { label: 'On board' },
  dropped:   { label: 'Dropped off',           hint: 'Completed. The driver has been credited for this seat.' },
  no_show:   { label: 'Did not turn up',       hint: 'The fare was forfeited. Check this one before keeping the money.' },
  cancelled: { label: 'Cancelled' },
  expired:   { label: 'Ran out of time',       hint: 'Not paid inside the window, so the seat went back on sale.' },
};

const BOOKS: Record<string, Record<string, Label>> = {
  seat:     SEAT,
  delivery: DELIVERY,
  driver:   DRIVER,
  return:   RETURN,
  role:     ROLE,
  zone:     ZONE,
};

/**
 * Fall back to a tidied version of the raw value rather than an empty
 * cell: an unmapped status must still render as something, because a
 * new status shipping to a blank column is worse than a clumsy word.
 */
function titleise(raw: string): string {
  const s = String(raw ?? '').replace(/[_-]+/g, ' ').trim();
  if (!s) return '-';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function humanLabel(book: keyof typeof BOOKS | string, raw: unknown): string {
  const key = String(raw ?? '').toLowerCase();
  return BOOKS[book]?.[key]?.label ?? titleise(key);
}

export function humanHint(book: keyof typeof BOOKS | string, raw: unknown): string | undefined {
  const key = String(raw ?? '').toLowerCase();
  return BOOKS[book]?.[key]?.hint;
}

/** Convenience wrappers, so call sites read as English too. */
export const deliveryStatus = (s: unknown) => humanLabel('delivery', s);
export const driverStatus   = (s: unknown) => humanLabel('driver', s);
export const returnStatus   = (s: unknown) => humanLabel('return', s);
export const roleLabel      = (s: unknown) => humanLabel('role', s);
export const zoneStatus     = (s: unknown) => humanLabel('zone', s);
export const seatStatus     = (s: unknown) => humanLabel('seat', s);
