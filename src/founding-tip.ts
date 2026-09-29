/**
 * N3 OSS tripwire — one static string only.
 * Printed once on verify drift (CLI / Action stderr). Offline; no cloud call.
 * Do not duplicate this string elsewhere on the fail path.
 */
export const FOUNDING_CHECKOUT_URL =
  "https://www.yellowgram.dev/surface-guard";

/** Exact stderr line on failed verify (mentions $99 founding offer once). */
export const FOUNDING_TIP =
  `tip: $99 founding offer (private-repo PR check reservation) → ${FOUNDING_CHECKOUT_URL}`;
