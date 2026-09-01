/**
 * The old KYC screen. It is now a redirect, and here is why it still exists.
 *
 * Identity and vehicle were two screens that asked for three of the same
 * documents. KYC wanted a vehicle photo, ownership papers and an insurance
 * certificate; My Vehicle wanted the same three, worded differently, with a
 * different uploader. A rider opening Profile saw "KYC Verification" and
 * "My Vehicle" and had no way to tell which one wanted what, which is
 * exactly what the founder objected to on 1 September 2026.
 *
 * They are one screen now, at /(driver)/vehicle, titled KYC Verification.
 *
 * This file is kept rather than deleted because a route that has existed in
 * shipped builds can still be reached: a notification, a deep link, or a
 * back-stack entry in an app that was open across the update. Deleting it
 * turns those into a dead end. A redirect costs nothing and cannot fail.
 */
import { Redirect } from 'expo-router';

export default function KycRedirect() {
  return <Redirect href="/(driver)/vehicle" />;
}
