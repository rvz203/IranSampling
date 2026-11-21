import type { OutboxItem, Sample } from "./types";
import { syncDelay } from "./location-policy";

type OutboxDelivery = {
  samples: (
    trackingId: string,
    samples: Sample[],
  ) => Promise<{ results: string[] }>;
  stop: (trackingId: string, stoppedAt: string) => Promise<unknown>;
  photo: (
    shiftId: string,
    id: string,
    uri: string,
    caption: string,
  ) => Promise<unknown>;
};
type DeliveryStore = {
  remove: (item: OutboxItem) => Promise<void>;
  failure: (
    item: OutboxItem,
    message: string,
    retryAt: number | null,
  ) => Promise<void>;
};

export type DeliveryResult = "done" | "retry" | "reauthenticate";

export async function deliverBatch(
  items: OutboxItem[],
  delivery: OutboxDelivery,
  store: DeliveryStore,
  now = Date.now(),
): Promise<DeliveryResult> {
  const sent = new Set<string>();
  for (const item of items) {
    if (sent.has(item.id)) continue;
    const payload = item.payload;
    const group =
      payload.kind === "fix"
        ? items.filter(
            (x) =>
              x.payload.kind === "fix" &&
              x.payload.trackingId === payload.trackingId,
          )
        : [item];
    group.forEach((row) => sent.add(row.id));
    let results: string[] | undefined;
    try {
      switch (payload.kind) {
        case "stop":
          await delivery.stop(payload.trackingId, payload.stoppedAt);
          break;
        case "photo":
          await delivery.photo(
            item.shiftId,
            item.id,
            payload.uri,
            payload.caption,
          );
          break;
        case "fix": {
          const samples = group.flatMap((x) =>
            x.payload.kind === "fix" ? [x.payload.sample] : [],
          );
          results = (await delivery.samples(payload.trackingId, samples))
            .results;
          if (
            !Array.isArray(results) ||
            results.length !== samples.length ||
            results.some(
              (value) =>
                ![
                  "stored",
                  "duplicate",
                  "break",
                  "outside_window",
                  "invalid_fix",
                ].includes(value),
            )
          ) {
            throw new Error("تأیید ارسال موقعیت کامل نبود.");
          }
          break;
        }
      }
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      if (status === 401) return "reauthenticate";
      const transient =
        status === 0 ||
        status === 408 ||
        status === 425 ||
        status === 429 ||
        status >= 500;
      const message =
        error instanceof Error ? error.message : "ارسال انجام نشد.";
      await Promise.all(
        group.map((x) =>
          store.failure(
            x,
            message,
            transient ? now + syncDelay(x.attempts) : null,
          ),
        ),
      );
      if (transient) return "retry";
      continue;
    }
    for (const [index, row] of group.entries()) {
      const result = results?.[index];
      if (result === "outside_window" || result === "invalid_fix") {
        await store.failure(
          row,
          result === "outside_window"
            ? "زمان نمونه خارج از بازه اشتراک شیفت است."
            : "نمونه موقعیت معتبر نیست.",
          null,
        );
      } else {
        await store.remove(row);
      }
    }
  }
  return "done";
}
