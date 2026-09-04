/**
 * A partner's Documents: things SEIRS sent THEM.
 *
 * Founder, 2026-09-04: "the store settings say document which usually when
 * you are downloading or requesting your data from seirs that where it
 * should go, should that be named kyc or something else."
 *
 * They had found a real collision. In the customer, driver and business
 * apps "Documents" means letters and records SEIRS sent you. In the partner
 * area alone it meant the opposite: the ID, CAC and shopfront photos the
 * shop sent US. Same word, opposite directions, and the notification that
 * fires when an admin sends a document says "is now in your Documents",
 * which pointed a partner at a screen showing something else entirely. The
 * letter was effectively invisible.
 *
 * So the word now means one thing everywhere. This route is the inbox, and
 * the shop's own uploads moved to verification.tsx, which is titled "Store
 * verification" rather than "KYC": KYC is banking jargon a shopkeeper in
 * Ikeja should not have to learn, and it does not survive translation into
 * the six languages the apps ship.
 *
 * Re-exported rather than reimplemented. (business)/documents.tsx already
 * describes itself as the "Business/partner Documents hub" and already
 * handles both admin-sent documents and the statement rollups. A second
 * copy would be two screens to keep in step and one of them would rot.
 */
export { default } from '../(business)/documents';
