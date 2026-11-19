import { fieldApi } from "./api";
import { storage } from "./storage";
import { deliverBatch, type DeliveryResult } from "./sync";
import { accountKey, type Identity } from "./types";

const inFlight = new Map<string, Promise<DeliveryResult>>();

export function flushOutbox(
  auth: Identity,
  options: { photos?: boolean; force?: boolean } = {},
) {
  const key = accountKey(auth);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const run = (async (): Promise<DeliveryResult> => {
    if (Date.parse(auth.expiresAt) <= Date.now()) return "reauthenticate";
    // Background delivery is bounded to one batch. Foreground can drain a backlog.
    const batches = options.photos ? 4 : 1;
    for (let i = 0; i < batches; i++) {
      const items = await storage.pending(
        auth,
        options.photos ?? false,
        options.force ?? false,
      );
      if (!items.length) break;
      const result = await deliverBatch(
        items,
        {
          samples: (trackingId, samples) =>
            fieldApi.samples(auth, trackingId, samples),
          stop: (trackingId, stoppedAt) =>
            fieldApi.stopTracking(auth, trackingId, stoppedAt),
          photo: (shiftId, id, uri, caption) =>
            fieldApi.photo(auth, shiftId, id, uri, caption),
        },
        {
          remove: (item) => storage.remove(auth, item),
          failure: (item, message, retryAt) =>
            storage.failure(auth, item, message, retryAt),
        },
      );
      if (result !== "done") return result;
    }
    return "done";
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}
