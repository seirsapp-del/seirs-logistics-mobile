/**
 * Platform commission rate.
 * Single source of truth — change here to adjust across pricing, payments,
 * and admin analytics.
 *
 * Per Master Spec V7 §3.4 and §3.5: Seirs takes 30% of net fare
 * (after Flutterwave processing fee), driver receives 70%.
 */
export const PLATFORM_COMMISSION = 0.30;

/** Driver's share of net fare (1 - PLATFORM_COMMISSION). */
export const DRIVER_SHARE = 1 - PLATFORM_COMMISSION;
