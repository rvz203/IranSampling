import type { GeoFix, Sample, TrackingState } from "./types";

export const LOCATION_PERIOD_MS = 30_000;
export const LOCATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function usableGeo(fix: GeoFix, maximumAccuracy: number): boolean {
  return (
    Number.isFinite(fix.latitude) &&
    Math.abs(fix.latitude) <= 90 &&
    Number.isFinite(fix.longitude) &&
    Math.abs(fix.longitude) <= 180 &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy > 0 &&
    fix.accuracy <= maximumAccuracy
  );
}

export function sampleForSession(
  state: TrackingState,
  fix: GeoFix,
  deviceTimestamp: number,
  now: number,
) {
  const capturedAt = deviceTimestamp + state.clockOffset;
  const bucket = Math.floor(capturedAt / LOCATION_PERIOD_MS);
  if (
    !Number.isFinite(capturedAt) ||
    capturedAt < Date.parse(state.started_at) ||
    capturedAt > Date.parse(state.expires_at) ||
    capturedAt > now + state.clockOffset + 1000 ||
    now - deviceTimestamp > LOCATION_RETENTION_MS ||
    !usableGeo(fix, 1000)
  )
    return null;
  if (state.lastBucket != null && bucket <= state.lastBucket) return null;
  const sample: Sample = {
    ...fix,
    captured_at: new Date(capturedAt).toISOString(),
  };
  return { bucket, sample };
}

export function syncDelay(attempts: number): number {
  return Math.min(300_000, 5_000 * 2 ** Math.min(6, attempts));
}
