export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const SESSION_EXPIRED_EVENT = "faracode:session-expired";
export async function api<T = { ok: boolean }>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(!multipart ? { "Content-Type": "application/json" } : {}),
      "X-Requested-With": "FaraCode",
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({
    error: "پاسخ سرور نامعتبر است / Invalid server response",
  }));
  if (!response.ok) {
    const error = new APIError(
      payload.error || "خطایی رخ داد / Something went wrong",
      response.status,
    );
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent(SESSION_EXPIRED_EVENT, { detail: error.message }),
      );
    throw error;
  }
  return payload as T;
}
export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "ارتباط برقرار نشد / Connection failed";
}
export function dayKey(date: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function tehranDateTimeToISO(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) throw new Error("زمان شیفت معتبر نیست / Invalid shift time");
  const [, y, m, d, h, minute, second = "0"] = match;
  const wall = new Date(0);
  wall.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
  wall.setUTCHours(Number(h), Number(minute), Number(second), 0);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = wall.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
    const displayed = new Date(0);
    displayed.setUTCFullYear(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    );
    displayed.setUTCHours(
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
      0,
    );
    const correction = wall.getTime() - displayed.getTime();
    if (!correction) return new Date(instant).toISOString();
    instant += correction;
  }
  throw new Error(
    "این ساعت در منطقه زمانی تهران معتبر نیست / This time is not valid in Tehran",
  );
}
export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("‌");
}
