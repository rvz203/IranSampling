import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUpdateFlow,
  UPDATE_CHECK_INTERVAL,
  type UpdatePhase,
} from "../src/update-flow";

const noAnimation = async () => {};

test("a startup check and manual check share one compatible download and reload only when safe", async () => {
  const phases: UpdatePhase[] = [];
  let checks = 0;
  let downloads = 0;
  let reloads = 0;
  let safe = false;
  const flow = createUpdateFlow(
    {
      enabled: true,
      check: async () => {
        checks++;
        return true;
      },
      download: async () => {
        downloads++;
        return true;
      },
      reload: async () => {
        reloads++;
      },
    },
    (phase) => phases.push(phase),
  );

  const startup = flow.check();
  assert.equal(flow.check("manual"), startup);
  await startup;
  assert.deepEqual(phases, ["checking", "downloading", "ready"]);
  await flow.check("manual");
  await flow.apply(() => safe, noAnimation);
  assert.equal(reloads, 0);
  assert.equal(checks, 1);
  assert.equal(downloads, 1);

  safe = true;
  await Promise.all([
    flow.apply(() => safe, noAnimation),
    flow.apply(() => safe, noAnimation),
  ]);
  assert.equal(phases.at(-1), "applying");
  assert.equal(reloads, 1);
});

test("a ready update waits if the app becomes unsafe during the install animation", async () => {
  const phases: UpdatePhase[] = [];
  let safe = true;
  let reloads = 0;
  const flow = createUpdateFlow(
    {
      enabled: true,
      check: async () => true,
      download: async () => true,
      reload: async () => {
        reloads++;
      },
    },
    (phase) => phases.push(phase),
  );

  await flow.check();
  await flow.apply(
    () => safe,
    async () => {
      safe = false;
    },
  );
  assert.deepEqual(phases, ["downloading", "ready", "applying", "ready"]);
  assert.equal(reloads, 0);
  safe = true;
  await flow.apply(() => safe, noAnimation);
  assert.equal(reloads, 1);
});

test("a failed download retries on reconnect without waiting for the regular check window", async () => {
  const phases: UpdatePhase[] = [];
  let attempts = 0;
  const flow = createUpdateFlow(
    {
      enabled: true,
      check: async () => true,
      download: async () => {
        attempts++;
        if (attempts === 1) throw new Error("Network unavailable");
        return true;
      },
      reload: async () => {
        assert.fail("The download must not reload on its own");
      },
    },
    (phase) => phases.push(phase),
    () => 10_000,
  );

  await flow.check();
  assert.equal(phases.at(-1), "download-failed");
  await flow.check();
  assert.equal(attempts, 1);
  await flow.check("reconnected");
  assert.equal(attempts, 2);
  assert.equal(phases.at(-1), "ready");
});

test("a failed reload can be retried without retrieving the installed update again", async () => {
  const phases: UpdatePhase[] = [];
  let downloads = 0;
  let reloads = 0;
  const flow = createUpdateFlow(
    {
      enabled: true,
      check: async () => true,
      download: async () => {
        downloads++;
        return true;
      },
      reload: async () => {
        reloads++;
        if (reloads === 1) throw new Error("Reload unavailable");
      },
    },
    (phase) => phases.push(phase),
  );

  await flow.check();
  await flow.apply(() => true, noAnimation);
  assert.equal(phases.at(-1), "apply-failed");
  await flow.check("manual");
  await flow.apply(() => true, noAnimation);
  assert.equal(downloads, 1);
  assert.equal(reloads, 2);
});

test("disabled builds stay usable and routine checks do not download a nonmatching update", async () => {
  const phases: UpdatePhase[] = [];
  let now = 0;
  let checks = 0;
  const driver = {
    enabled: true,
    check: async () => {
      checks++;
      return false;
    },
    download: async () => {
      assert.fail("No compatible update was offered");
    },
    reload: async () => {
      assert.fail("No pending update can be applied");
    },
  };
  const disabled = createUpdateFlow({ ...driver, enabled: false }, (phase) =>
    phases.push(phase),
  );
  await disabled.check();
  await disabled.check("manual");
  assert.equal(checks, 0);
  assert.deepEqual(phases, ["disabled"]);

  const enabled = createUpdateFlow(
    driver,
    (phase) => phases.push(phase),
    () => now,
  );
  await enabled.check();
  await enabled.check();
  assert.equal(checks, 1);
  now += UPDATE_CHECK_INTERVAL;
  await enabled.check();
  await enabled.check("manual");
  assert.equal(checks, 3);
  assert.equal(phases.at(-1), "current");
});
