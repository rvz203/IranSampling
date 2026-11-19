export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "applying"
  | "current"
  | "disabled"
  | "download-failed"
  | "apply-failed";

type UpdateDriver = {
  enabled: boolean;
  check: () => Promise<boolean>;
  download: () => Promise<boolean>;
  reload: () => Promise<void>;
};

export const UPDATE_CHECK_INTERVAL = 15 * 60_000;

export function createUpdateFlow(
  driver: UpdateDriver,
  onPhase: (phase: UpdatePhase) => void,
  now = Date.now,
) {
  let phase: UpdatePhase = "idle";
  let lastCheck = -Infinity;
  let manual = false;
  let inFlight: Promise<void> | undefined;

  function show(next: UpdatePhase) {
    phase = next;
    onPhase(next);
  }

  function check(reason: "scheduled" | "reconnected" | "manual" = "scheduled") {
    const requested = reason === "manual";
    if (!driver.enabled) {
      if (requested) show("disabled");
      return;
    }
    if (inFlight) {
      if (requested) {
        manual = true;
        if (phase !== "downloading") show("checking");
      }
      return inFlight;
    }
    if (phase === "ready" || phase === "applying" || phase === "apply-failed")
      return;
    const currentTime = now();
    if (
      reason === "scheduled" &&
      currentTime - lastCheck < UPDATE_CHECK_INTERVAL
    )
      return;

    lastCheck = currentTime;
    manual = requested;
    if (manual) show("checking");
    inFlight = Promise.resolve()
      .then(async () => {
        if (await driver.check()) {
          show("downloading");
          if (await driver.download()) {
            show("ready");
            return;
          }
        }
        show(manual ? "current" : "idle");
      })
      .catch(() =>
        show(manual || phase === "downloading" ? "download-failed" : "idle"),
      )
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  async function apply(
    canReload: () => boolean,
    transition: () => Promise<void>,
  ) {
    if ((phase !== "ready" && phase !== "apply-failed") || !canReload()) return;
    show("applying");
    await transition();
    if (!canReload()) {
      show("ready");
      return;
    }
    try {
      await driver.reload();
    } catch {
      show("apply-failed");
    }
  }

  return { check, apply };
}
