"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Users,
} from "lucide-react";
import { api, errorText } from "@/lib/api";
import { useWorkspace } from "./context";
import { Avatar, Button, CardHeading, Empty, RoleLabel, Select } from "./ui";
import { IranMap, mapLocationUrl } from "./iran-map";

type Point = {
  person_id: string;
  person_name: string;
  role: "sampler" | "supervisor";
  state?: "working" | "break" | "before_work";
  shift_id: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  captured_at: string | null;
  received_at: string | null;
};

type Feed = { server_time: string; points: Point[] };
const markerKey = (point: Point) => `${point.shift_id}:${point.person_id}`;

export function LiveTeamMap({ campaign = "" }: { campaign?: string }) {
  const { data, t, n, time, selectShift } = useWorkspace();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [shift, setShift] = useState("");
  const [selected, setSelected] = useState("");
  const [reload, setReload] = useState(0);
  const seen = useRef(Date.now());
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    setFeed(null);
    setError("");
    async function refresh() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const filters = new URLSearchParams();
        if (shift) filters.set("shift_id", shift);
        if (campaign) filters.set("campaign_id", campaign);
        const next = await api<Feed>(`/tracking/live?${filters}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (!controller.signal.aborted) {
          seen.current = Date.now();
          setFeed(next);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(errorText(error));
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [campaign, shift, reload]);

  const points = feed?.points ?? [];
  const plotted = points.filter(
    (point): point is Point & { latitude: number; longitude: number } =>
      point.latitude != null && point.longitude != null,
  );
  const lats = plotted.map((point) => point.latitude);
  const lngs = plotted.map((point) => point.longitude);
  const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const middleLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const span = plotted.length
    ? Math.max(
        0.002,
        Math.max(...lats) - Math.min(...lats),
        Math.max(...lngs) - Math.min(...lngs),
      )
    : 1;
  const now = feed
    ? Date.parse(feed.server_time) + Date.now() - seen.current
    : Date.now();
  const fresh = (p: Point) =>
    !!p.captured_at && !error && now - Date.parse(p.captured_at) <= 90_000;
  const activeShifts = data.shifts.filter(
    (item) =>
      item.status === "active" &&
      !item.ended_at &&
      (!campaign || item.campaign_id === campaign) &&
      (data.user.role === "admin" || item.supervisor_id === data.user.id),
  );

  return (
    <section
      className="card live-team-card"
      aria-label={t("موقعیت زنده تیم", "Live team locations")}
    >
      <CardHeading
        title={t("موقعیت زنده تیم", "Live team locations")}
        subtitle={t(
          "آخرین موقعیت به‌اشتراک‌گذاشته‌شده در شیفت‌های فعال",
          "Latest shared locations from active shifts",
        )}
        action={
          <div className="live-team-controls">
            <Select
              aria-label={t("شیفت نمایش موقعیت", "Location feed shift")}
              value={shift}
              onChange={(e) => {
                setShift(e.target.value);
                setSelected("");
              }}
            >
              <option value="">
                {t("همه شیفت‌های فعال", "All active shifts")}
              </option>
              {activeShifts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.location_name} · {item.campaign_name}
                </option>
              ))}
            </Select>
            <Button
              icon={RefreshCw}
              onClick={() => setReload((value) => value + 1)}
            >
              {t("تازه‌سازی", "Refresh")}
            </Button>
          </div>
        }
      />
      {error && (
        <div className="live-team-problem" role="alert">
          {t(
            "ارتباط با سرویس موقعیت برقرار نشد.",
            "Could not refresh team locations.",
          )}{" "}
          {error}
        </div>
      )}
      {!error && !feed && (
        <p className="live-team-loading" role="status">
          {t("در حال دریافت موقعیت‌ها…", "Loading team locations…")}
        </p>
      )}
      {feed && points.length === 0 && (
        <Empty
          icon={Users}
          title={t("اشتراک موقعیت فعال نیست", "Nobody is sharing a location")}
          description={t(
            "سرپرست یا سمپلر پس از ثبت ورود، اشتراک موقعیت را از اپ شیفت فعال می‌کند.",
            "Supervisors and samplers start sharing in the field app after checking in.",
          )}
        />
      )}
      {points.length > 0 && (
        <div className="live-team-content">
          {data.map_available && plotted.length ? (
            <div className="live-team-plot">
              <IranMap
                selected={selected}
                onSelect={setSelected}
                points={plotted.map((point) => ({
                  id: markerKey(point),
                  label: point.person_name,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  stale: !fresh(point),
                }))}
              />
            </div>
          ) : (
            <div
              className="live-team-plot"
              dir="ltr"
              aria-label={t(
                "نقشه شماتیک مختصات اعضای تیم",
                "Schematic team coordinate map",
              )}
            >
              <div className="live-team-compass">N ↑</div>
              {!plotted.length && (
                <span className="live-team-no-fix">
                  {t(
                    points.every((point) => point.state === "break")
                      ? "ثبت موقعیت در استراحت متوقف است"
                      : "منتظر نمونه موقعیت",
                    points.every((point) => point.state === "break")
                      ? "Location recording is paused for lunch"
                      : "Waiting for location fixes",
                  )}
                </span>
              )}
              {plotted.map((point) => (
                <button
                  type="button"
                  key={markerKey(point)}
                  data-fresh={fresh(point)}
                  className={`live-team-marker ${selected === markerKey(point) ? "selected" : ""}`}
                  style={{
                    left: `${50 + (70 * (point.longitude - middleLng)) / span}%`,
                    top: `${50 - (70 * (point.latitude - middleLat)) / span}%`,
                  }}
                  aria-label={point.person_name}
                  aria-pressed={selected === markerKey(point)}
                  title={point.person_name}
                  onClick={() => setSelected(markerKey(point))}
                >
                  <MapPin size={19} />
                </button>
              ))}
              <span className="live-team-map-label">
                {t(
                  "نمای شماتیک · مختصات واقعی",
                  "Schematic view · actual coordinates",
                )}
              </span>
            </div>
          )}
          <div className="live-team-list">
            {points.map((point) => (
              <article
                className={`live-team-row ${selected === markerKey(point) ? "selected" : ""}`}
                key={markerKey(point)}
                data-testid={`live-person-${point.person_id}`}
              >
                <div className="live-team-person">
                  <Avatar name={point.person_name} />
                  <div>
                    {data.map_available &&
                    point.latitude != null &&
                    point.longitude != null ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setSelected(markerKey(point))}
                      >
                        <strong>{point.person_name}</strong>
                      </button>
                    ) : (
                      <strong>{point.person_name}</strong>
                    )}
                    <small>
                      <RoleLabel role={point.role} /> · {point.location_name}
                    </small>
                  </div>
                  <span
                    className={`live-team-status ${fresh(point) ? "fresh" : ""}`}
                  >
                    {point.state === "break"
                      ? t("استراحت ناهار", "Lunch break")
                      : point.state === "before_work"
                        ? t("پیش از شروع کار", "Before working hours")
                        : fresh(point)
                          ? t("به‌روز", "Fresh")
                          : point.captured_at
                            ? t("آخرین موقعیت", "Last known")
                            : t("در انتظار موقعیت", "Waiting for fix")}
                  </span>
                </div>
                <div className="live-team-actions">
                  {point.captured_at && (
                    <span>
                      <LocateFixed size={15} />
                      {time(point.captured_at)} ·{" "}
                      {n(Math.round(point.accuracy ?? 0))} {t("متر", "m")}
                    </span>
                  )}
                  <button
                    className="text-button"
                    onClick={() => selectShift(point.shift_id)}
                  >
                    {t("جزئیات شیفت", "Shift details")}
                  </button>
                  {point.latitude != null && point.longitude != null && (
                    <a
                      className="text-button"
                      href={mapLocationUrl(point.latitude, point.longitude)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={14} />
                      {t("باز کردن نقشه", "Open map")}
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
