import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
  rmdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOCATION_PERIOD_MS, sampleForSession } from "../src/location-policy";
import {
  FIELD_DATABASE_SCHEMA,
  INSERT_OUTBOX,
  PENDING_OUTBOX,
} from "../src/outbox-sql";
import { deliverBatch } from "../src/sync";
import { parseOrigin } from "../src/origin";
import type { OutboxItem, TrackingState } from "../src/types";

const now = Date.parse("2026-11-19T09:00:00Z");
const session: TrackingState = {
  id: "track",
  shift_id: "shift",
  started_at: new Date(now - 60_000).toISOString(),
  expires_at: new Date(now + 60_000).toISOString(),
  server_time: new Date(now).toISOString(),
  clockOffset: 2_000,
  background: true,
  lastBucket: null,
};
const fix = { latitude: 35.79, longitude: 51.41, accuracy: 15 };

test("phone sign-in accepts an HTTPS origin and restricts cleartext to local builds", () => {
  assert.equal(
    parseOrigin(" https://Sampling.example.com/ ", false),
    "https://sampling.example.com",
  );
  assert.equal(
    parseOrigin("http://10.0.2.2:8081", true),
    "http://10.0.2.2:8081",
  );
  for (const invalid of [
    "http://sampling.example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
    "https://example.com:65536",
  ])
    assert.throws(() => parseOrigin(invalid, false));
});

test("SQLite outbox survives a restart and keeps queued work isolated by account", () => {
  const directory = mkdtempSync(join(tmpdir(), "sampling-mobile-test-"));
  const path = join(directory, "field.db");
  const imagePath = join(directory, "queued.jpg");
  let db = new DatabaseSync(path);
  try {
    db.exec(FIELD_DATABASE_SCHEMA);
    writeFileSync(imagePath, "test photo bytes");
    const add = db.prepare(INSERT_OUTBOX);
    add.run(
      "image",
      "server|sampler",
      "shift",
      "photo",
      JSON.stringify({ uri: imagePath }),
      now,
    );
    add.run("fix", "server|sampler", "shift", "fix", JSON.stringify(fix), now);
    add.run(
      "fix",
      "server|sampler",
      "shift",
      "fix",
      JSON.stringify({ ...fix, latitude: 0 }),
      now,
    );
    add.run(
      "other",
      "server|supervisor",
      "shift",
      "fix",
      JSON.stringify(fix),
      now,
    );
    db.close();
    db = new DatabaseSync(path);
    const pending = db.prepare(PENDING_OUTBOX);
    const restored = pending.all("server|sampler", 0, now, 1);
    assert.deepEqual(
      restored.map((row) => row.id),
      ["fix", "image"],
    );
    assert.equal(
      JSON.parse(String(restored[0]?.payload)).latitude,
      fix.latitude,
    );
    assert.equal(
      readFileSync(JSON.parse(String(restored[1]?.payload)).uri, "utf8"),
      "test photo bytes",
    );
    assert.deepEqual(
      pending.all("server|supervisor", 0, now, 1).map((row) => row.id),
      ["other"],
    );
    assert.deepEqual(
      pending.all("server|sampler", 0, now, 0).map((row) => row.id),
      ["fix"],
    );
  } finally {
    db.close();
    for (const file of [path, `${path}-wal`, `${path}-shm`, imagePath])
      rmSync(file, { force: true });
    rmdirSync(directory);
  }
});

test("one real fix per thirty second slot with clock correction and shift boundaries", () => {
  const first = sampleForSession(session, fix, now - 2_000, now)!;
  assert.equal(first.sample.captured_at, new Date(now).toISOString());
  assert.equal(
    sampleForSession(
      { ...session, lastBucket: first.bucket },
      fix,
      now + 1_000,
      now + 1_000,
    ),
    null,
  );
  assert.equal(
    sampleForSession(
      { ...session, lastBucket: first.bucket },
      fix,
      now + LOCATION_PERIOD_MS - 2_000,
      now + LOCATION_PERIOD_MS,
    )?.bucket,
    first.bucket + 1,
  );
  assert.equal(
    sampleForSession(session, { ...fix, accuracy: 0 }, now, now),
    null,
  );
  assert.equal(sampleForSession(session, fix, now - 70_000, now), null);
  assert.equal(
    sampleForSession(session, fix, now + 61_000, now + 62_000),
    null,
  );
});

const row = (id: string, payload: OutboxItem["payload"]): OutboxItem => ({
  id,
  shiftId: "shift",
  payload,
  createdAt: now,
  attempts: 0,
  error: null,
  rejected: false,
});
const rows = [
  row("stop", {
    kind: "stop",
    trackingId: "track",
    stoppedAt: new Date(now).toISOString(),
  }),
  row("fix1", {
    kind: "fix",
    trackingId: "track",
    sample: { ...fix, captured_at: new Date(now - 30_000).toISOString() },
  }),
  row("fix2", {
    kind: "fix",
    trackingId: "track",
    sample: { ...fix, captured_at: new Date(now).toISOString() },
  }),
  row("photo", {
    kind: "photo",
    uri: "file:///test/photo.jpg",
    caption: "A field photo",
  }),
];

function fixture() {
  const removed: string[] = [];
  const failures: { id: string; retryAt: number | null }[] = [];
  const calls: string[] = [];
  const transport = {
    stop: async (id: string) => {
      calls.push(`stop:${id}`);
    },
    samples: async (id: string, samples: unknown[]) => {
      calls.push(`fixes:${id}:${samples.length}`);
      return { results: ["stored", "duplicate"] };
    },
    photo: async (shift: string, id: string) => {
      calls.push(`photo:${shift}:${id}`);
    },
  };
  const store = {
    remove: async (item: OutboxItem) => {
      removed.push(item.id);
    },
    failure: async (
      item: OutboxItem,
      message: string,
      retryAt: number | null,
    ) => {
      assert.ok(message);
      failures.push({ id: item.id, retryAt });
    },
  };
  return { removed, failures, calls, transport, store };
}

test("offline replay preserves original order and removes only confirmed rows", async () => {
  const f = fixture();
  const failed = {
    ...f.transport,
    stop: async () => {
      throw Object.assign(new Error("offline"), { status: 0 });
    },
  };
  assert.equal(await deliverBatch(rows, failed, f.store, now), "retry");
  assert.deepEqual(f.removed, []);
  assert.deepEqual(f.failures, [{ id: "stop", retryAt: now + 5_000 }]);
  assert.equal(
    await deliverBatch(rows, f.transport, f.store, now + 5_000),
    "done",
  );
  assert.deepEqual(f.calls, [
    "stop:track",
    "fixes:track:2",
    "photo:shift:photo",
  ]);
  assert.deepEqual(f.removed, ["stop", "fix1", "fix2", "photo"]);
});

test("partial validation, failed photo and expired login preserve evidence for review or reauthentication", async () => {
  const f = fixture();
  const failed = {
    ...f.transport,
    samples: async () => ({ results: ["stored", "outside_window"] }),
    photo: async () => {
      throw Object.assign(new Error("expired"), { status: 401 });
    },
  };
  assert.equal(
    await deliverBatch(rows, failed, f.store, now),
    "reauthenticate",
  );
  assert.deepEqual(f.removed, ["stop", "fix1"]);
  assert.deepEqual(f.failures, [{ id: "fix2", retryAt: null }]);
});
