import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import type {
  CampaignEvent,
  CampaignMessage,
  GeoFix,
  Identity,
  LivePoint,
  Sample,
  TrackingSession,
  User,
  Workspace,
} from "./types";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  origin: string,
  path: string,
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    timeout?: number;
  } = {},
): Promise<T> {
  const form = options.body instanceof FormData;
  const body =
    options.body == null
      ? undefined
      : form
        ? (options.body as FormData)
        : JSON.stringify(options.body);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout ?? 12_000,
  );
  try {
    const response = await expoFetch(`${origin}/api${path}`, {
      method: options.method ?? (body == null ? "GET" : "POST"),
      redirect: "error",
      headers: {
        "X-Requested-With": "FaraCode",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(form || body == null ? {} : { "Content-Type": "application/json" }),
      },
      body,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new RequestError(
        data?.error ?? "سرور نتوانست این درخواست را انجام دهد.",
        response.status,
      );
    if (data == null) throw new RequestError("پاسخ سرور کامل نبود.", 502);
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "ارتباط با سرور برقرار نشد. اتصال را بررسی کنید و دوباره تلاش کنید.",
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function signIn(
  origin: string,
  identifier: string,
  password: string,
): Promise<Identity> {
  const data = await request<{ token: string; expires_at: string; user: User }>(
    origin,
    "/mobile/auth/login",
    { body: { identifier: identifier.trim(), password } },
  );
  return {
    origin,
    token: data.token,
    expiresAt: data.expires_at,
    user: data.user,
  };
}

export const fieldApi = {
  workspace: (auth: Identity) =>
    request<Workspace>(auth.origin, "/workspace", { token: auth.token }),
  live: (auth: Identity, campaign?: string) =>
    request<{ points: LivePoint[]; server_time: string }>(
      auth.origin,
      `/tracking/live${campaign ? `?campaign_id=${encodeURIComponent(campaign)}` : ""}`,
      { token: auth.token },
    ),
  campaignMessages: (auth: Identity, campaign: string, before?: number) =>
    request<{ messages: CampaignMessage[]; next_before: number | null }>(
      auth.origin,
      `/campaigns/${encodeURIComponent(campaign)}/messages${before ? `?before=${before}` : ""}`,
      { token: auth.token },
    ),
  sendCampaignMessage: (
    auth: Identity,
    campaign: string,
    body: { body: string; client_id: string },
  ) =>
    request<CampaignMessage>(
      auth.origin,
      `/campaigns/${encodeURIComponent(campaign)}/messages`,
      { token: auth.token, body },
    ),
  campaignHistory: (auth: Identity, campaign: string, before?: string) =>
    request<{ events: CampaignEvent[]; next_before: string | null }>(
      auth.origin,
      `/campaigns/${encodeURIComponent(campaign)}/history${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      { token: auth.token },
    ),
  mutate: (auth: Identity, path: string, body: unknown, method = "POST") =>
    request<{ ok?: boolean; id?: string }>(auth.origin, path, {
      token: auth.token,
      body,
      method,
    }),
  attendance: (
    auth: Identity,
    shiftId: string,
    action: "check-in" | "check-out",
    fix: GeoFix,
  ) =>
    request(auth.origin, `/shifts/${shiftId}/${action}`, {
      token: auth.token,
      body: fix,
    }),
  startTracking: (auth: Identity, shiftId: string) =>
    request<TrackingSession>(auth.origin, `/shifts/${shiftId}/tracking`, {
      token: auth.token,
      body: { consent: true },
    }),
  stopTracking: (auth: Identity, id: string, stoppedAt: string) =>
    request(auth.origin, `/tracking/${id}/stop`, {
      token: auth.token,
      body: { stopped_at: stoppedAt },
    }),
  samples: (auth: Identity, id: string, samples: Sample[]) =>
    request<{ results: string[] }>(auth.origin, `/tracking/${id}/samples`, {
      token: auth.token,
      body: { samples },
    }),
  photo: (
    auth: Identity,
    shiftId: string,
    id: string,
    uri: string,
    caption: string,
  ) => {
    const file = new File(uri);
    if (!file.exists)
      throw new RequestError("فایل تصویر روی دستگاه پیدا نشد.", 422);
    const form = new FormData();
    form.append("file", file, `${id}.jpg`);
    form.append("client_id", id);
    form.append("caption", caption);
    return request(auth.origin, `/shifts/${shiftId}/evidence`, {
      token: auth.token,
      body: form,
      timeout: 26_000,
    });
  },
  logout: (auth: Identity) =>
    request(auth.origin, "/auth/logout", {
      token: auth.token,
      body: {},
      timeout: 3_000,
    }),
};
