"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Clock3, History, MessageCircle, Send } from "lucide-react";
import { api, APIError, errorText } from "@/lib/api";
import { useWorkspace } from "./context";
import { Button, Empty, RoleLabel } from "./ui";

type Message = {
  id: number;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
};
type Event = {
  id: string;
  detail: string;
  actor_name: string;
  shift_id: string;
  location_name: string;
  created_at: string;
};
type MessagePage = { messages: Message[]; next_before: number | null };
type EventPage = { events: Event[]; next_before: string | null };

export function CampaignMessages({ campaign }: { campaign: string }) {
  const { data, t, date, time } = useWorkspace();
  const path = `/campaigns/${encodeURIComponent(campaign)}/messages`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [before, setBefore] = useState<number | null | undefined>();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [older, setOlder] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [sendError, setSendError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const attempt = useRef<{ body: string; client_id: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  function append(rows: Message[]) {
    setMessages((current) => {
      const byID = new Map(current.map((row) => [row.id, row]));
      rows.forEach((row) => byID.set(row.id, row));
      return [...byID.values()].sort((a, b) => a.id - b.id);
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const page = await api<MessagePage>(path, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (controller.signal.aborted) return;
        append(page.messages);
        setBefore((cursor) =>
          cursor === undefined ? page.next_before : cursor,
        );
        setFeedError("");
        setForbidden(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof APIError && error.status === 403) {
          setMessages([]);
          setBefore(undefined);
          setForbidden(true);
        }
        setFeedError(errorText(error));
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 4_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [path]);

  useLayoutEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!before || older) return;
    setOlder(true);
    try {
      const page = await api<MessagePage>(`${path}?before=${before}`);
      follow.current = false;
      append(page.messages);
      setBefore(page.next_before);
    } catch (error) {
      setFeedError(errorText(error));
    } finally {
      setOlder(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || forbidden) return;
    if (attempt.current?.body !== body)
      attempt.current = { body, client_id: crypto.randomUUID() };
    setSending(true);
    setSendError("");
    try {
      const message = await api<Message>(path, {
        method: "POST",
        body: JSON.stringify(attempt.current),
      });
      follow.current = true;
      append([message]);
      setDraft("");
      attempt.current = null;
    } catch (error) {
      setSendError(errorText(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="campaign-records"
      aria-label={t("گفت‌وگوی کمپین", "Campaign conversation")}
    >
      {before && (
        <Button disabled={older} onClick={loadOlder}>
          {t("پیام‌های قدیمی‌تر", "Older messages")}
        </Button>
      )}
      <div
        className="campaign-chat"
        ref={scroll}
        onScroll={(event) => {
          const el = event.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {before === undefined && !feedError ? (
          <p role="status">
            {t("در حال دریافت پیام‌ها…", "Loading messages…")}
          </p>
        ) : null}
        {before !== undefined && !messages.length && !feedError && (
          <Empty
            icon={MessageCircle}
            title={t("هنوز پیامی ثبت نشده", "Start the conversation")}
          />
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`campaign-message ${message.sender_id === data.user.id ? "mine" : ""}`}
          >
            <header>
              <strong>{message.sender_name}</strong>
              <span>
                <RoleLabel role={message.sender_role} />
              </span>
            </header>
            <p dir="auto">{message.body}</p>
            <time dateTime={message.created_at}>
              {date(message.created_at, { month: "short", day: "numeric" })} ·{" "}
              {time(message.created_at)}
            </time>
          </article>
        ))}
      </div>
      {feedError && (
        <p className="form-error" role="alert">
          {feedError}
        </p>
      )}
      {!forbidden && (
        <form className="campaign-composer" onSubmit={send}>
          <label className="form-field">
            <span>{t("پیام شما", "Your message")}</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={2000}
              disabled={sending}
              placeholder={t(
                "برای تیم این کمپین بنویسید…",
                "Write to this campaign’s team…",
              )}
            />
          </label>
          {sendError && (
            <p className="form-error" role="alert">
              {sendError}
            </p>
          )}
          <Button
            type="submit"
            icon={Send}
            variant="primary"
            disabled={sending || !draft.trim()}
          >
            {sending
              ? t("در حال ارسال…", "Sending…")
              : t("ارسال پیام", "Send message")}
          </Button>
        </form>
      )}
    </section>
  );
}

export function CampaignHistory({ campaign }: { campaign: string }) {
  const { t, date, time, data, selectShift } = useWorkspace();
  const path = `/campaigns/${encodeURIComponent(campaign)}/history`;
  const [events, setEvents] = useState<Event[]>([]);
  const [before, setBefore] = useState<string | null | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<EventPage>(path, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    })
      .then((page) => {
        if (controller.signal.aborted) return;
        setEvents(page.events);
        setBefore(page.next_before);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error));
      });
    return () => controller.abort();
  }, [path, reload]);

  async function loadOlder() {
    if (!before || loading) return;
    setLoading(true);
    try {
      const page = await api<EventPage>(
        `${path}?before=${encodeURIComponent(before)}`,
      );
      setEvents((current) => [...current, ...page.events]);
      setBefore(page.next_before);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="campaign-records"
      aria-label={t("تاریخچه کمپین", "Campaign history")}
    >
      {error ? (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <Button onClick={() => setReload((value) => value + 1)}>
            {t("تلاش دوباره", "Try again")}
          </Button>
        </>
      ) : null}
      {before === undefined && !error && (
        <p role="status">{t("در حال دریافت تاریخچه…", "Loading history…")}</p>
      )}
      {before !== undefined && !events.length && (
        <Empty icon={History} title={t("رویدادی ثبت نشده", "No events yet")} />
      )}
      <ol className="campaign-timeline">
        {events.map((event) => (
          <li key={event.id}>
            <span className="campaign-event-icon">
              <Clock3 size={17} />
            </span>
            <div>
              <p>{event.detail}</p>
              <small>
                {event.actor_name}
                {event.location_name ? ` · ${event.location_name}` : ""}
              </small>
              <time dateTime={event.created_at}>
                {date(event.created_at)} · {time(event.created_at)}
              </time>
              {data.shifts.some((shift) => shift.id === event.shift_id) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => selectShift(event.shift_id)}
                >
                  {t("جزئیات شیفت", "Shift details")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {before && (
        <Button disabled={loading} onClick={loadOlder}>
          {t("رویدادهای قدیمی‌تر", "Older events")}
        </Button>
      )}
    </section>
  );
}
