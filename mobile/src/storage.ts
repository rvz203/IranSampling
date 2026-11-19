import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { Directory, File, Paths } from "expo-file-system";
import type {
  Identity,
  OutboxItem,
  OutboxPayload,
  TrackingState,
  Workspace,
} from "./types";
import { accountKey } from "./types";
import {
  FIELD_DATABASE_SCHEMA,
  INSERT_OUTBOX,
  PENDING_OUTBOX,
} from "./outbox-sql";

const credentialKey = "sampling.account.v1";
const credentialOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
let database: Promise<SQLite.SQLiteDatabase> | undefined;

function db() {
  database ??= (async () => {
    const sqlite = await SQLite.openDatabaseAsync("sampling-field.db");
    await sqlite.execAsync(FIELD_DATABASE_SCHEMA);
    return sqlite;
  })().catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

type OutboxRow = {
  id: string;
  shift_id: string;
  payload: string;
  created_at: number;
  attempts: number;
  problem: string | null;
  rejected: number;
};
const fromRow = (row: OutboxRow): OutboxItem => ({
  id: row.id,
  shiftId: row.shift_id,
  payload: JSON.parse(row.payload),
  createdAt: row.created_at,
  attempts: row.attempts,
  error: row.problem,
  rejected: row.rejected === 1,
});

export async function loadIdentity(): Promise<Identity | null> {
  const raw = await SecureStore.getItemAsync(credentialKey, credentialOptions);
  return raw ? (JSON.parse(raw) as Identity) : null;
}
export async function saveIdentity(auth: Identity) {
  await SecureStore.setItemAsync(
    credentialKey,
    JSON.stringify(auth),
    credentialOptions,
  );
}
export async function clearIdentity() {
  await SecureStore.deleteItemAsync(credentialKey, credentialOptions);
}

export const storage = {
  async cache(auth: Identity, state: Workspace) {
    await (
      await db()
    ).runAsync(
      "INSERT OR REPLACE INTO cache(account,workspace,saved_at) VALUES(?,?,?)",
      accountKey(auth),
      JSON.stringify(state),
      Date.now(),
    );
  },
  async cached(auth: Identity) {
    const row = await (
      await db()
    ).getFirstAsync<{ workspace: string; saved_at: number }>(
      "SELECT workspace,saved_at FROM cache WHERE account=?",
      accountKey(auth),
    );
    return row
      ? { data: JSON.parse(row.workspace) as Workspace, savedAt: row.saved_at }
      : null;
  },
  async tracking(auth: Identity): Promise<TrackingState | null> {
    const row = await (
      await db()
    ).getFirstAsync<{ data: string; last_bucket: number | null }>(
      "SELECT data,last_bucket FROM tracking WHERE account=?",
      accountKey(auth),
    );
    return row
      ? {
          ...(JSON.parse(row.data) as TrackingState),
          lastBucket: row.last_bucket,
        }
      : null;
  },
  async activate(auth: Identity, state: TrackingState) {
    await (
      await db()
    ).runAsync(
      `INSERT INTO tracking(account,id,data,last_bucket) VALUES(?,?,?,NULL) ON CONFLICT(account) DO UPDATE SET id=excluded.id,data=excluded.data,last_bucket=CASE WHEN tracking.id=excluded.id THEN tracking.last_bucket ELSE NULL END`,
      accountKey(auth),
      state.id,
      JSON.stringify(state),
    );
  },
  async updateTrackingMode(auth: Identity, state: TrackingState) {
    await (
      await db()
    ).runAsync(
      "UPDATE tracking SET data=? WHERE account=? AND id=?",
      JSON.stringify(state),
      accountKey(auth),
      state.id,
    );
  },
  async trackFix(
    auth: Identity,
    state: TrackingState,
    bucket: number,
    sample: Extract<OutboxPayload, { kind: "fix" }>["sample"],
  ) {
    const account = accountKey(auth);
    const sqlite = await db();
    await sqlite.withExclusiveTransactionAsync(async (tx) => {
      const tag = await tx.runAsync(
        "UPDATE tracking SET last_bucket=? WHERE account=? AND id=? AND (last_bucket IS NULL OR last_bucket<?)",
        bucket,
        account,
        state.id,
        bucket,
      );
      if (tag.changes === 0) return;
      const payload: OutboxPayload = {
        kind: "fix",
        trackingId: state.id,
        sample,
      };
      await tx.runAsync(
        INSERT_OUTBOX,
        `${state.id}:${bucket}`,
        account,
        state.shift_id,
        payload.kind,
        JSON.stringify(payload),
        Date.now(),
      );
    });
  },
  async endTracking(auth: Identity, state: TrackingState, stoppedAt: string) {
    const sqlite = await db();
    const account = accountKey(auth);
    await sqlite.withExclusiveTransactionAsync(async (tx) => {
      const tag = await tx.runAsync(
        "DELETE FROM tracking WHERE account=? AND id=?",
        account,
        state.id,
      );
      if (tag.changes === 0) return;
      const payload: OutboxPayload = {
        kind: "stop",
        trackingId: state.id,
        stoppedAt,
      };
      await tx.runAsync(
        INSERT_OUTBOX,
        `stop:${state.id}`,
        account,
        state.shift_id,
        payload.kind,
        JSON.stringify(payload),
        Date.now(),
      );
    });
  },
  async addPhoto(
    auth: Identity,
    shiftId: string,
    id: string,
    uri: string,
    caption: string,
  ) {
    const directory = new Directory(Paths.document, "sampling-evidence");
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, `${id}.jpg`);
    new File(uri).copy(file);
    try {
      const payload: OutboxPayload = { kind: "photo", uri: file.uri, caption };
      await (
        await db()
      ).runAsync(
        INSERT_OUTBOX,
        id,
        accountKey(auth),
        shiftId,
        payload.kind,
        JSON.stringify(payload),
        Date.now(),
      );
    } catch (error) {
      file.delete();
      throw error;
    }
  },
  async pending(auth: Identity, includePhotos: boolean, force: boolean) {
    const rows = await (
      await db()
    ).getAllAsync<OutboxRow>(
      PENDING_OUTBOX,
      accountKey(auth),
      force ? 1 : 0,
      Date.now(),
      includePhotos ? 1 : 0,
    );
    let photos = 0;
    return rows
      .map(fromRow)
      .filter((item) => item.payload.kind !== "photo" || ++photos <= 2);
  },
  async pendingStop(auth: Identity, shiftId: string) {
    const row = await (
      await db()
    ).getFirstAsync(
      "SELECT 1 FROM outbox WHERE account=? AND shift_id=? AND kind='stop' AND rejected=0",
      accountKey(auth),
      shiftId,
    );
    return row != null;
  },
  async entries(auth: Identity) {
    const rows = await (
      await db()
    ).getAllAsync<OutboxRow>(
      "SELECT * FROM outbox WHERE account=? ORDER BY rejected DESC,created_at DESC LIMIT 60",
      accountKey(auth),
    );
    return rows.map(fromRow);
  },
  async counts(auth: Identity) {
    const summary = await (
      await db()
    ).getFirstAsync<{ pending: number; rejected: number; photos: number }>(
      `SELECT count(*) FILTER(WHERE rejected=0) pending,count(*) FILTER(WHERE rejected=1) rejected,count(*) FILTER(WHERE kind='photo') photos FROM outbox WHERE account=?`,
      accountKey(auth),
    );
    return summary ?? { pending: 0, rejected: 0, photos: 0 };
  },
  async remove(auth: Identity, item: OutboxItem) {
    await (
      await db()
    ).runAsync(
      "DELETE FROM outbox WHERE account=? AND id=?",
      accountKey(auth),
      item.id,
    );
    if (item.payload.kind === "photo") {
      try {
        const file = new File(item.payload.uri);
        if (file.exists) file.delete();
      } catch {
        // The server has already acknowledged this upload.
      }
    }
  },
  async failure(
    auth: Identity,
    item: OutboxItem,
    message: string,
    retryAt: number | null,
  ) {
    await (
      await db()
    ).runAsync(
      "UPDATE outbox SET attempts=attempts+1,problem=?,retry_at=?,rejected=? WHERE account=? AND id=?",
      message,
      retryAt ?? 0,
      retryAt == null ? 1 : 0,
      accountKey(auth),
      item.id,
    );
  },
};
