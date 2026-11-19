import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { fieldApi } from "./api";
import {
  LOCATION_PERIOD_MS,
  sampleForSession,
  usableGeo,
} from "./location-policy";
import { flushOutbox } from "./outbox";
import { loadIdentity, storage } from "./storage";
import type { Identity, TrackingState } from "./types";

const TASK = "sampling-active-shift-location";

const fixFrom = (position: Location.LocationObject) => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy ?? 0,
});

async function requireForegroundPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "برای ثبت موقعیت، از تنظیمات دستگاه دسترسی دقیق به مکان را فعال کنید.",
    );
}

async function currentPosition(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "موقعیت تازه پیدا نشد. GPS را روشن کنید و دوباره تلاش کنید.",
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function attendanceFix() {
  await requireForegroundPermission();
  const fix = fixFrom(await currentPosition());
  if (!usableGeo(fix, 150))
    throw new Error(
      "دقت فعلی کافی نیست. برای ثبت حضور به فضای باز بروید و دوباره تلاش کنید.",
    );
  return fix;
}

async function stopNativeTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
}

function expired(auth: Identity, state: TrackingState) {
  return (
    Date.now() + state.clockOffset >= Date.parse(state.expires_at) ||
    Date.now() >= Date.parse(auth.expiresAt)
  );
}

async function queueLocations(
  auth: Identity,
  locations: Location.LocationObject[],
) {
  const state = await storage.tracking(auth);
  if (!state) {
    await stopNativeTracking();
    return;
  }
  // iOS can deliver multiple fixes together after device sleep.
  for (const position of locations.sort((a, b) => a.timestamp - b.timestamp)) {
    if (position.mocked) continue;
    const entry = sampleForSession(
      state,
      fixFrom(position),
      position.timestamp,
      Date.now(),
    );
    if (entry) await storage.trackFix(auth, state, entry.bucket, entry.sample);
  }
  if (expired(auth, state)) await stopSharing(auth, false);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK,
  async ({ data, error }) => {
    try {
      const auth = await loadIdentity();
      if (!auth) {
        await stopNativeTracking();
        return;
      }
      if (!error && data?.locations?.length)
        await queueLocations(auth, data.locations);
      else {
        const track = await storage.tracking(auth);
        if (!track || expired(auth, track)) await stopSharing(auth, false);
      }
      if ((await flushOutbox(auth)) === "reauthenticate")
        await stopSharing(auth, false);
    } catch {
      // A callback must leave the persistent outbox intact for the next wake.
    }
  },
);

export async function beginSharing(
  auth: Identity,
  shiftId: string,
): Promise<TrackingState> {
  await requireForegroundPermission();
  if (await storage.pendingStop(auth, shiftId)) {
    await flushOutbox(auth, { force: true });
    if (await storage.pendingStop(auth, shiftId))
      throw new Error(
        "توقف قبلی هنوز همگام نشده است. اتصال را برقرار کنید و دوباره تلاش کنید.",
      );
  }
  const beforeRequest = Date.now();
  const session = await fieldApi.startTracking(auth, shiftId);
  const clockOffset =
    Date.parse(session.server_time) -
    Math.round((beforeRequest + Date.now()) / 2);
  const state: TrackingState = {
    ...session,
    clockOffset,
    background: false,
    lastBucket: null,
  };
  try {
    await storage.activate(auth, state);
  } catch (error) {
    await fieldApi
      .stopTracking(auth, state.id, session.server_time)
      .catch(() => {});
    throw error;
  }
  try {
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.granted) {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_PERIOD_MS,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Other,
        foregroundService: {
          notificationTitle: "اشتراک موقعیت شیفت فعال است",
          notificationBody:
            "برای توقف یا دیدن صف ارسال، اپ ایران سمپلینگ را باز کنید.",
          notificationColor: "#273b30",
          killServiceOnDestroy: true,
        },
      });
      state.background = true;
      await storage.updateTrackingMode(auth, state);
    }
  } catch {
    await stopNativeTracking().catch(() => {});
    state.background = false;
  }
  return state;
}

export async function reconcileTracking(auth: Identity) {
  const state = await storage.tracking(auth);
  if (!state) {
    await stopNativeTracking().catch(() => {});
    return null;
  }
  if (expired(auth, state)) {
    await stopSharing(auth, false);
    return null;
  }
  if (
    state.background &&
    !(await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))
  ) {
    state.background = false;
    await storage.updateTrackingMode(auth, state);
  }
  return state;
}

export async function collectForeground(auth: Identity) {
  const state = await reconcileTracking(auth);
  if (!state) return;
  const position = await currentPosition();
  await queueLocations(auth, [position]);
}

export async function stopSharing(auth: Identity, flush = true) {
  const state = await storage.tracking(auth);
  try {
    if (state) {
      const stoppedAt = new Date(
        Math.min(Date.now() + state.clockOffset, Date.parse(state.expires_at)),
      ).toISOString();
      await storage.endTracking(auth, state, stoppedAt);
    }
  } finally {
    await stopNativeTracking().catch(() => {});
  }
  if (flush) await flushOutbox(auth);
}
