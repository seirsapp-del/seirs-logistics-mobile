/**
 * How a spend line describes itself.
 *
 * Pulled out of business.service.ts on 2026-09-01 so the PDF generator
 * can say exactly what the screen says. A statement and its printed
 * version disagreeing about what a charge was for is the kind of thing
 * somebody notices in front of their accountant.
 *
 * Deliberately a plain module with no Nest decorators and no imports:
 * statements/ and business/ both pull from it, and neither should drag
 * the other's providers along behind it.
 */
/**
 * The narrative column of a spend statement line.
 *
 * A statement is read by somebody reconciling it against a bank
 * statement months later, so every line has to say what the money
 * bought without them opening the app. Non-delivery charges are named
 * outright rather than lumped in as "payment": a redirect fee that
 * reads the same as a fare is exactly the line that generates the
 * phone call.
 */
export function spendNarrative(r: {
  purpose?: string | null;
  kind?: string | null;
  stops?: number | string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  trackingCode?: string | null;
}): string {
  switch (r.purpose) {
    case 'redirect_fee':     return 'Redirect to a partner store';
    case 'address_change':   return 'Address change';
    case 'return_to_sender': return 'Return to sender';
    case 'store_dropoff':    return 'Partner store drop-off';
    case 'store_topup':      return 'Weight top-up at the counter';
  }

  if (r.kind === 'ride') {
    const to = shortAddress(r.dropoffAddress);
    return to ? `Ride to ${to}` : 'Ride';
  }

  const stops = Number(r.stops ?? 0);
  if (stops > 1) {
    const area = areaOf(r.pickupAddress);
    return area ? `${area} · ${stops} stops` : `${stops} stops`;
  }

  return shortAddress(r.dropoffAddress) || r.trackingCode || 'Delivery';
}

/**
 * The area a multi-stop run covers, pulled off the pickup address.
 *
 * A heuristic, not a lookup: Nigerian addresses here are free text, so
 * this reads the usual "street, area, state" shape and takes the area.
 * Worst case it prints a slightly wrong label next to a right amount,
 * which is why the stop count and the run code travel alongside it.
 */
export function areaOf(address?: string | null): string {
  const parts = String(address ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[1];
  return parts[0] ?? '';
}

/** Street and area, short enough to sit on one line of a phone. */
export function shortAddress(address?: string | null): string {
  const parts = String(address ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const short = parts.slice(0, 2).join(', ');
  return short.length > 42 ? `${short.slice(0, 41)}…` : short;
}

/**
 * How the money arrived, in words a sender recognises.
 *
 * Null in, null out: a rail nobody recorded is left off the line rather
 * than guessed at. No processor is ever named here, and "card" is only
 * ever one of the answers, never the label for all of them.
 */
export function methodLabel(method?: string | null): string | null {
  switch (method) {
    case 'card':              return 'Card';
    case 'bank_transfer':     return 'Bank transfer';
    case 'ussd':              return 'USSD';
    case 'mobile_money':      return 'Mobile money';
    case 'wallet':            return 'SEIRS balance';
    case 'cash_on_delivery':  return 'Cash on delivery';
    default:                  return null;
  }
}

// Per-stop verification code for multi-drop runs. STP- prefix keeps it
// visually distinct from SRS- tracking codes and SDR- drop codes so
// support agents can identify what kind of code a user is reading out.
// Crypto-secure via the shared secureCode primitive (2026-08-09).
