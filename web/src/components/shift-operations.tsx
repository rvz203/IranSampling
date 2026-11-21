"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  Camera,
  Clock3,
  Coffee,
  FileCheck2,
  Flag,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Users,
} from "lucide-react";
import { api, errorText } from "@/lib/api";
import type { Shift, ShiftSummary, ShiftSummaryEntry } from "@/lib/types";
import { useWorkspace } from "./context";
import { IranMap } from "./iran-map";
import { Arrow, Avatar, Button, Empty, RoleLabel, Select } from "./ui";

type TrackPoint = {
  captured_at: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  segment: string;
};
type TrackHistory = {
  person_name: string;
  retention_days: number;
  samples: TrackPoint[];
};
const rowCount = 8;

function routeSegments(samples: TrackPoint[]) {
  const segments: [number, number][][] = [];
  let previous: TrackPoint | undefined;
  for (const point of samples) {
    if (
      !previous ||
      point.segment !== previous.segment ||
      Date.parse(point.captured_at) - Date.parse(previous.captured_at) > 90_000
    )
      segments.push([]);
    segments.at(-1)!.push([point.longitude, point.latitude]);
    previous = point;
  }
  return segments.filter((segment) => segment.length > 1);
}

export function ShiftTrackingHistory({ shift }: { shift: Shift }) {
  const { t, n, date, locale, data } = useWorkspace();
  const clock = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const time = (value: string) => clock.format(new Date(value));
  const [member, setMember] = useState(shift.supervisor_id);
  const [reload, setReload] = useState(0);
  const [response, setResponse] = useState<{
    member: string;
    history?: TrackHistory;
    error?: string;
  }>();
  const [focused, setFocused] = useState<string>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<TrackHistory>(
      `/shifts/${encodeURIComponent(shift.id)}/tracking-history?person_id=${encodeURIComponent(member)}`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15_000),
        ]),
      },
    ).then(
      (history) => {
        if (!controller.signal.aborted) setResponse({ member, history });
      },
      (error) => {
        if (!controller.signal.aborted)
          setResponse({ member, error: errorText(error) });
      },
    );
    return () => controller.abort();
  }, [shift.id, member, reload]);
  const current = response?.member === member ? response : undefined;
  const history = current?.history;
  const samples = history?.samples ?? [];
  const first = samples[0];
  const last = samples.at(-1);
  const markers = [
    first,
    first === last ? undefined : last,
    samples.find(
      (point) =>
        point.captured_at === focused && point !== first && point !== last,
    ),
  ].flatMap((point) =>
    point
      ? [
          {
            id: point.captured_at,
            label: `${history?.person_name} · ${time(point.captured_at)}`,
            latitude: point.latitude,
            longitude: point.longitude,
          },
        ]
      : [],
  );
  const maxPage = Math.max(0, Math.ceil(samples.length / rowCount) - 1);
  const activePage = Math.min(maxPage, page);
  const visibleRows = samples
    .slice()
    .reverse()
    .slice(activePage * rowCount, (activePage + 1) * rowCount);
  return (
    <section className="detail-section track-history">
      <div className="shift-section-heading">
        <span className="shift-feature-icon">
          <Route size={20} />
        </span>
        <div>
          <h3>{t("تاریخچه موقعیت شیفت", "Shift location history")}</h3>
          <p>
            {t(
              "مسیر ثبت‌شده را برای هر عضو تیم مرور کنید.",
              "Review the recorded route for each team member.",
            )}
          </p>
        </div>
      </div>
      <div className="track-filters">
        <Select
          aria-label={t("عضو تیم برای تاریخچه", "Team member for history")}
          value={member}
          onChange={(event) => {
            setMember(event.target.value);
            setFocused(undefined);
            setPage(0);
          }}
        >
          <option value={shift.supervisor_id}>
            {shift.supervisor_name} · {t("سرپرست", "Supervisor")}
          </option>
          {shift.team.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {t("سمپلر", "Sampler")}
            </option>
          ))}
        </Select>
        <Button
          icon={RefreshCw}
          onClick={() => {
            setResponse(undefined);
            setReload((i) => i + 1);
          }}
        >
          {t("به‌روزرسانی مسیر", "Refresh route")}
        </Button>
      </div>
      {!current && (
        <p role="status">{t("دریافت تاریخچه…", "Loading location history…")}</p>
      )}
      {current?.error && (
        <p className="form-error" role="alert">
          {current.error}
        </p>
      )}
      {history && (
        <>
          <small className="track-retention">
            {t(
              `موقعیت‌ها تا ${n(history.retention_days)} روز پس از ثبت در دسترس‌اند.`,
              "Location points are kept for " +
                n(history.retention_days) +
                " days.",
            )}
          </small>
          {first && last ? (
            <>
              <div className="track-totals">
                <div>
                  <Route size={16} />
                  <small>{t("نمونه ثبت‌شده", "Recorded points")}</small>
                  <strong>{n(samples.length)}</strong>
                </div>
                <div>
                  <Clock3 size={16} />
                  <small>{t("اولین موقعیت", "First fix")}</small>
                  <strong>{time(first.captured_at)}</strong>
                </div>
                <div>
                  <Flag size={16} />
                  <small>{t("آخرین موقعیت", "Last fix")}</small>
                  <strong>{time(last.captured_at)}</strong>
                </div>
              </div>
              {data.map_available && (
                <div className="track-history-map">
                  <IranMap
                    points={markers}
                    routes={routeSegments(samples)}
                    selected={focused}
                    onSelect={setFocused}
                  />
                </div>
              )}
              <ol
                className="track-list"
                aria-label={t("نقاط مسیر", "Route points")}
              >
                {visibleRows.map((point) => (
                  <li key={point.captured_at}>
                    <button
                      type="button"
                      aria-pressed={focused === point.captured_at}
                      onClick={() => setFocused(point.captured_at)}
                    >
                      <MapPin size={17} />
                      <span>
                        <strong>{time(point.captured_at)}</strong>
                        <small>{date(point.captured_at)}</small>
                      </span>
                      <bdi dir="ltr">
                        {point.latitude.toFixed(5)},{" "}
                        {point.longitude.toFixed(5)}
                      </bdi>
                      <small>
                        {n(Math.round(point.accuracy))} {t("متر", "m")}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
              {maxPage > 0 && (
                <div className="track-pagination">
                  <Button
                    disabled={activePage === 0}
                    onClick={() => setPage(activePage - 1)}
                  >
                    {t("جدیدتر", "Newer")}
                  </Button>
                  <span>
                    {n(activePage + 1)} / {n(maxPage + 1)}
                  </span>
                  <Button
                    disabled={activePage === maxPage}
                    onClick={() => setPage(activePage + 1)}
                  >
                    {t("قدیمی‌تر", "Older")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Empty
              icon={MapPin}
              title={t("موقعیتی در این بازه ثبت نشده", "No recorded locations")}
            />
          )}
        </>
      )}
    </section>
  );
}

export function ShiftWorkHours({ shift }: { shift: Shift }) {
  const { t, time, date } = useWorkspace();
  return (
    <div className="shift-hours">
      <div>
        <Clock3 size={17} />
        <span>{t("ساعت کار", "Working hours")}</span>
        <strong>
          {time(shift.starts_at)} – {time(shift.ends_at)}
        </strong>
      </div>
      {shift.break_starts_at && shift.break_ends_at && (
        <div className="shift-hours-break">
          <Coffee size={17} />
          <span>{t("استراحت ناهار", "Lunch break")}</span>
          <strong>
            {time(shift.break_starts_at)} – {time(shift.break_ends_at)}
          </strong>
        </div>
      )}
      {shift.ended_at && (
        <div>
          <FileCheck2 size={17} />
          <span>{t("پایان اجرا", "Shift ended")}</span>
          <strong>
            {date(shift.ended_at)} · {time(shift.ended_at)}
          </strong>
        </div>
      )}
    </div>
  );
}

export function ShiftSummaryPanel({ shiftId }: { shiftId: string }) {
  const { t, date, time, n, data } = useWorkspace();
  const [response, setResponse] = useState<{
    summary?: ShiftSummary;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<ShiftSummary>(`/shifts/${encodeURIComponent(shiftId)}/summary`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    }).then(
      (summary) => {
        if (!controller.signal.aborted) setResponse({ summary });
      },
      (error) => {
        if (!controller.signal.aborted)
          setResponse({ error: errorText(error) });
      },
    );
    return () => controller.abort();
  }, [shiftId, retry]);
  const summary = response?.summary;
  if (!summary)
    return response?.error ? (
      <div className="detail-section">
        <p className="form-error" role="alert">
          {response.error}
        </p>
        <Button
          icon={RefreshCw}
          onClick={() => {
            setResponse(undefined);
            setRetry((i) => i + 1);
          }}
        >
          {t("تلاش دوباره", "Retry")}
        </Button>
      </div>
    ) : (
      <p role="status">{t("دریافت خلاصه شیفت…", "Loading shift summary…")}</p>
    );
  const { metrics } = summary;
  const stats = [
    {
      label: t("توزیع / هدف", "Distributed / target"),
      value: `${n(metrics.distributed)} / ${n(metrics.target)}`,
      icon: Flag,
    },
    {
      label: t("موجودی پایان", "Closing stock"),
      value: n(metrics.remaining),
      icon: Package,
    },
    {
      label: t("عکس اجرا", "Evidence photos"),
      value: n(metrics.photo_count),
      icon: Camera,
    },
    {
      label: t("مشکل باز", "Open issues"),
      value: n(metrics.open_issues),
      icon: Flag,
    },
  ];
  return (
    <section
      className="detail-section shift-summary-panel"
      aria-label={t("خلاصه خودکار شیفت", "Automatic shift summary")}
    >
      <div className="shift-section-heading">
        <span className="shift-feature-icon">
          <FileCheck2 size={20} />
        </span>
        <div>
          <h3>{t("خلاصه خودکار شیفت", "Automatic shift summary")}</h3>
          <p>
            {date(summary.ended_at)} · {time(summary.ended_at)}
          </p>
        </div>
      </div>
      <div className="track-totals summary-totals">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon size={16} />
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="summary-stock">
        {t("تحویل", "Received")} {n(metrics.received)} <span>·</span>{" "}
        {t("آسیب‌دیده", "Damaged")} {n(metrics.damaged)} <span>·</span>{" "}
        {t("برگشتی", "Returned")} {n(metrics.returned)}
      </p>
      <div className="shift-summary-roster">
        {metrics.team.map((person) => (
          <div className="team-person-row" key={person.id}>
            <Avatar name={person.name} size="small" />
            <div>
              <strong>{person.name}</strong>
              <small>
                <RoleLabel role={person.role} />
                {(data.user.role !== "sampler" || data.user.id === person.id) &&
                  (person.checked_in_at
                    ? ` · ${time(person.checked_in_at)}${person.checked_out_at ? " – " + time(person.checked_out_at) : ""}`
                    : t(" · حضور ثبت نشده", " · No check-in"))}
              </small>
            </div>
            {person.checked_in_at && (
              <div className="summary-person-time">
                <strong>
                  {n(person.work_minutes ?? 0)} {t("دقیقه کار", "min worked")}
                </strong>
                {person.ended_automatically && (
                  <small>{t("پایان خودکار", "Auto-closed")}</small>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function GeneratedShiftReports({ rows }: { rows: ShiftSummaryEntry[] }) {
  const { t, n, date, time, open } = useWorkspace();
  if (!rows.length)
    return (
      <Empty
        icon={FileCheck2}
        title={t(
          "خلاصه‌ای در این بازه موجود نیست",
          "No automatic shift summaries",
        )}
      />
    );
  return (
    <div className="generated-reports">
      {rows.map((row) => (
        <button
          className="generated-report-card"
          key={row.shift_id}
          onClick={() => open({ kind: "shift-summary", id: row.shift_id })}
        >
          <span className="shift-feature-icon">
            <FileCheck2 size={20} />
          </span>
          <span className="generated-report-main">
            <strong>{row.location_name}</strong>
            <small>{row.campaign_name}</small>
            <span>
              <Users size={14} /> {n(row.team_count)} {t("نفر", "people")}{" "}
              <span>·</span> <ArrowDownRight size={14} /> {n(row.distributed)}{" "}
              {t("توزیع", "distributed")}
            </span>
          </span>
          <span className="generated-report-end">
            <small>
              {date(row.ended_at)} · {time(row.ended_at)}
            </small>
            <Arrow size={17} />
          </span>
        </button>
      ))}
    </div>
  );
}
