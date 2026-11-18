"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpLeft,
  CalendarDays,
  ChevronDown,
  MapPin,
  Minus,
  Plus,
  ScanLine,
  TrendingUp,
  Package,
  Megaphone,
  ClipboardCheck,
} from "lucide-react";
import { useWorkspace } from "./context";
import { CardHeading } from "./ui";
import { dayKey } from "@/lib/api";

function smoothPath(points: number[][]) {
  return points
    .map((p, i) => {
      if (!i) return `M${p[0]},${p[1]}`;
      const previous = points[i - 1];
      const mid = (previous[0] + p[0]) / 2;
      return `C${mid},${previous[1]} ${mid},${p[1]} ${p[0]},${p[1]}`;
    })
    .join(" ");
}
export function Sparkline({
  values,
  color = "var(--teal)",
}: {
  values: number[];
  color?: string;
}) {
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => [
    (i * 78) / Math.max(values.length - 1, 1) + 2,
    30 - (value / max) * 23,
  ]);
  return (
    <svg className="sparkline" viewBox="0 0 84 36" aria-hidden="true">
      <path
        d={smoothPath(points)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function DistributionChart({ days }: { days: number }) {
  const { data, t, n, date } = useWorkspace();
  const [hover, setHover] = useState<number | null>(null);
  const trend = data.trend.slice(-days);
  const targets = trend.map((d) =>
    data.shifts
      .filter((s) => dayKey(s.starts_at) === d.date)
      .reduce((sum, s) => sum + s.target, 0),
  );
  const max =
    Math.ceil(
      Math.max(...trend.map((d) => d.distributed), ...targets, 1) / 1000,
    ) * 1000;
  const width = 700,
    left = 43,
    right = 18,
    top = 26,
    bottom = 172;
  const points = trend.map((d, i) => [
    left + (i * (width - left - right)) / Math.max(trend.length - 1, 1),
    bottom - (d.distributed / max) * (bottom - top),
  ]);
  const targetPoints = targets.map((v, i) => [
    points[i][0],
    bottom - (v / max) * (bottom - top),
  ]);
  const path = smoothPath(points);
  return (
    <div className="distribution-chart">
      <svg
        viewBox="0 0 700 210"
        role="img"
        aria-label={t(
          "روند توزیع نمونه‌ها در مقایسه با هدف روزانه",
          "Samples distributed against the daily target",
        )}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111111" stopOpacity=".18" />
            <stop offset="100%" stopColor="#111111" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const y = top + (i * (bottom - top)) / 3;
          return (
            <g key={i}>
              <line
                x1={left}
                y1={y}
                x2={width - right}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <text
                x={left - 12}
                y={y + 4}
                textAnchor="end"
                className="chart-label"
              >
                {n(Math.round(max * (1 - i / 3)), { notation: "compact" })}
              </text>
            </g>
          );
        })}
        <path
          d={smoothPath(targetPoints)}
          fill="none"
          stroke="#b5b5b5"
          strokeWidth="1.6"
          strokeDasharray="5 5"
        />
        {points.length > 1 && (
          <>
            <path
              d={`${path} L${points.at(-1)![0]},${bottom} L${left},${bottom} Z`}
              fill="url(#chart-fill)"
            />
            <path
              d={path}
              fill="none"
              stroke="#111111"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </>
        )}
        {points.map((p, i) => (
          <g key={i}>
            <text x={p[0]} y="199" textAnchor="middle" className="chart-label">
              {date(trend[i].date + "T12:00:00", {
                year: undefined,
                day: "numeric",
                month: "short",
              })}
            </text>
            <circle
              cx={p[0]}
              cy={p[1]}
              r={hover === i ? 6 : 3.8}
              fill="var(--teal)"
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx={p[0]}
              cy={p[1]}
              r="17"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${date(trend[i].date + "T12:00:00")}: ${n(trend[i].distributed)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          </g>
        ))}
        {hover !== null && points[hover] && (
          <g pointerEvents="none">
            <rect
              x={Math.min(580, Math.max(45, points[hover][0] - 45))}
              y={Math.max(2, points[hover][1] - 40)}
              width="92"
              height="28"
              rx="7"
              fill="#111111"
            />
            <text
              x={Math.min(580, Math.max(45, points[hover][0] - 45)) + 46}
              y={Math.max(2, points[hover][1] - 40) + 18}
              textAnchor="middle"
              fill="white"
              fontSize="12"
            >
              {n(trend[hover].distributed)} {t("نمونه", "samples")}
            </text>
          </g>
        )}
      </svg>
      <table className="sr-only">
        <caption>{t("توزیع روزانه", "Daily distribution")}</caption>
        <thead>
          <tr>
            <th>{t("روز", "Date")}</th>
            <th>{t("توزیع", "Distributed")}</th>
            <th>{t("هدف", "Target")}</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((d, i) => (
            <tr key={d.date}>
              <td>{date(d.date + "T12:00:00")}</td>
              <td>{d.distributed}</td>
              <td>{targets[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function OverviewStats({ days = 7 }: { days?: number }) {
  const { data, t, n } = useWorkspace();
  const current = data.trend
    .slice(-days)
    .reduce((sum, d) => sum + d.distributed, 0);
  const previous = data.trend
    .slice(0, 7)
    .reduce((sum, d) => sum + d.distributed, 0);
  const delta =
    previous && days === 7
      ? Math.round(((current - previous) / previous) * 100)
      : null;
  const activePoints = new Set(
    data.shifts.filter((s) => s.status === "active").map((s) => s.location_id),
  ).size;
  const pending = data.reports.filter((r) => r.status === "pending").length;
  const issues = data.issues.filter((i) => i.status !== "resolved").length;
  const stats = [
    {
      label: t("نمونه‌های توزیع‌شده", "Samples distributed"),
      value: current,
      detail: n(days) + " " + t("روز گذشته", "day total"),
      icon: Package,
    },
    {
      label: t("کمپین‌های فعال", "Active campaigns"),
      value: data.campaigns.filter((c) => c.status === "active").length,
      detail:
        t("از مجموع", "Out of") +
        " " +
        n(data.campaigns.length) +
        " " +
        t("کمپین", "campaigns"),
      icon: Megaphone,
    },
    {
      label: t("نقاط در حال اجرا", "Active locations"),
      value: activePoints,
      detail:
        n(
          new Set(
            data.shifts.filter((s) => s.status === "active").map((s) => s.city),
          ).size,
        ) +
        " " +
        t("شهر، یک تیم هماهنگ", "cities, one connected team"),
      icon: MapPin,
    },
    {
      label: t("نیازمند بررسی شما", "Needs your attention"),
      value: pending + issues,
      detail:
        n(pending) +
        " " +
        t("گزارش و", "reports and") +
        " " +
        n(issues) +
        " " +
        t("مشکل باز", "open issues"),
      icon: ClipboardCheck,
    },
  ];
  return (
    <div className="stats-grid">
      {stats.map((stat, index) => (
        <article className="stat-card" key={stat.label}>
          <div className="stat-top">
            <span>{stat.label}</span>
            <span className="stat-icon">
              <stat.icon size={21} strokeWidth={1.8} />
            </span>
          </div>
          <div className="stat-main">
            <strong>{n(stat.value)}</strong>
            {index === 0 ? (
              <Sparkline
                values={data.trend.slice(-days).map((d) => d.distributed)}
              />
            ) : (
              <span className="stat-number-index" aria-hidden="true">
                0{index + 1}
              </span>
            )}
          </div>
          <div className="stat-bottom">
            {index === 0 && delta !== null && (
              <span className={`delta ${delta >= 0 ? "positive" : "negative"}`}>
                {delta >= 0 ? (
                  <ArrowUpLeft size={13} />
                ) : (
                  <ArrowDownLeft size={13} />
                )}
                {n(Math.abs(delta))}٪
              </span>
            )}
            <span>{stat.detail}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
export function GoalCard() {
  const { data, t, n, date } = useWorkspace();
  const today = dayKey(data.server_time);
  const latestDay = data.shifts.length
    ? [...data.shifts]
        .map((s) => dayKey(s.starts_at))
        .sort()
        .at(-1)!
    : today;
  const scope = data.shifts.some((s) => dayKey(s.starts_at) === today)
    ? today
    : latestDay;
  const shifts = data.shifts.filter((s) => dayKey(s.starts_at) === scope);
  const target = shifts.reduce((sum, s) => sum + s.target, 0);
  const actual = shifts.reduce((sum, s) => sum + s.distributed, 0);
  const percent = target ? Math.round((actual / target) * 100) : 0;
  const circumference = 2 * Math.PI * 58;
  return (
    <article className="goal-card">
      <div className="goal-header">
        <span>
          {scope === today
            ? t("هدف امروز", "Today's target")
            : t("آخرین روز اجرا", "Latest activation day")}
        </span>
        <span className="goal-date">
          {date(scope + "T12:00:00", {
            year: undefined,
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
      <div className="goal-content">
        <div className="goal-ring">
          <svg viewBox="0 0 150 150" aria-hidden="true">
            <circle
              cx="75"
              cy="75"
              r="58"
              fill="none"
              stroke="#3c3c3c"
              strokeWidth="9"
            />
            <circle
              cx="75"
              cy="75"
              r="58"
              fill="none"
              stroke="#ffffff"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={
                circumference * (1 - Math.min(100, percent) / 100)
              }
              transform="rotate(-90 75 75)"
            />
          </svg>
          <div>
            <strong>
              {n(percent)}
              <small>٪</small>
            </strong>
            <span>{t("تحقق هدف", "target reached")}</span>
          </div>
        </div>
        <div className="goal-copy">
          <h2>
            {percent >= 100
              ? t("هدف، محقق شد.", "Target. Reached.")
              : t(
                  "هر اجرا، یک قدم جلوتر.",
                  "Every activation. A step forward.",
                )}
          </h2>
          <p>
            {t(
              "عملکرد واقعی تیم در برابر هدف توزیع نمونه.",
              "Your team's actual performance against its distribution target.",
            )}
          </p>
        </div>
      </div>
      <div className="goal-footer">
        <span>
          {t("توزیع‌شده", "Distributed")}
          <strong>
            {n(actual)} <small>{t("نمونه", "samples")}</small>
          </strong>
        </span>
        <span>
          {t("هدف توزیع", "Planned target")}
          <strong>
            {n(target)} <small>{t("نمونه", "samples")}</small>
          </strong>
        </span>
        <span className="goal-symbol" aria-hidden="true">
          ↗
        </span>
      </div>
    </article>
  );
}

export function OperationsMap({ expanded = false }: { expanded?: boolean }) {
  const { data, t, n, selectShift, open, planner } = useWorkspace();
  const [city, setCity] = useState("تهران");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const cities = Array.from(new Set(data.locations.map((l) => l.city)));
  const actualCity = cities.includes(city) ? city : cities[0];
  const locations = data.locations.filter((l) => l.city === actualCity);
  const shifts = data.shifts.filter(
    (s) => s.status !== "completed" && s.city === actualCity,
  );
  const bounds = locations.length
    ? {
        minX: Math.min(...locations.map((l) => l.longitude)) - 0.035,
        maxX: Math.max(...locations.map((l) => l.longitude)) + 0.035,
        minY: Math.min(...locations.map((l) => l.latitude)) - 0.025,
        maxY: Math.max(...locations.map((l) => l.latitude)) + 0.025,
      }
    : { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return (
    <article className={`card map-card ${expanded ? "expanded" : ""}`}>
      <CardHeading
        title={t("عملیات، روی نقشه", "Your operations, mapped")}
        subtitle={t(
          "یک نگاه نزدیک‌تر به نقاط اجرا",
          "A closer look at every touchpoint",
        )}
        action={
          <div className="map-city">
            <MapPin size={14} />
            <select
              aria-label={t("انتخاب شهر", "Select city")}
              value={actualCity || ""}
              onChange={(e) => {
                setCity(e.target.value);
                setSelected(null);
                setZoom(1);
              }}
            >
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
        }
      />
      <div className="map-canvas">
        <div className="map-drawing" style={{ transform: `scale(${zoom})` }}>
          <svg
            className="city-art"
            viewBox="0 0 800 380"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id="city-grid"
                width="80"
                height="65"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M2 0v65M0 2h80"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="8"
                />
                <rect
                  x="11"
                  y="12"
                  width="24"
                  height="16"
                  rx="3"
                  fill="#e3e3e3"
                />
                <rect
                  x="43"
                  y="12"
                  width="25"
                  height="16"
                  rx="3"
                  fill="#dedede"
                />
                <rect
                  x="11"
                  y="36"
                  width="57"
                  height="18"
                  rx="3"
                  fill="#e7e7e7"
                />
              </pattern>
            </defs>
            <rect width="800" height="380" fill="#f0f0f0" />
            <rect width="800" height="380" fill="url(#city-grid)" />
            <path
              d="M0 28Q70 88 160 30T340 32T510 20T720 39T850 15V0H0Z"
              fill="#e0e3df"
            />
            <path
              d="M0 16Q80 76 170 17T350 19T530 6T750 25"
              stroke="#cdd0cb"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M0 8Q80 68 170 9T350 11T530 0T750 17"
              stroke="#cdd0cb"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M325 80q70-30 100 10t-15 65q-55 25-70-12Z"
              fill="#dde2dc"
            />
            <path d="M600 213q70-25 94 28t-47 75q-48 3-60-36Z" fill="#dde2dc" />
            <path d="M110 215q-30 20-10 52t68 4l7-43Z" fill="#dde2dc" />
            <path
              d="M-20 325C120 330 140 170 300 190S500 290 820 110"
              stroke="#d3d3d3"
              strokeWidth="15"
              fill="none"
            />
            <path
              d="M-20 325C120 330 140 170 300 190S500 290 820 110"
              stroke="#ffffff"
              strokeWidth="10"
              fill="none"
            />
            <path
              d="M-20 140C140 160 260 105 420 145S620 215 830 175"
              stroke="#d3d3d3"
              strokeWidth="15"
              fill="none"
            />
            <path
              d="M-20 140C140 160 260 105 420 145S620 215 830 175"
              stroke="#ffffff"
              strokeWidth="10"
              fill="none"
            />
            <path
              d="M505-30C490 80 535 125 480 225S470 330 440 410"
              stroke="#d3d3d3"
              strokeWidth="15"
              fill="none"
            />
            <path
              d="M505-30C490 80 535 125 480 225S470 330 440 410"
              stroke="#ffffff"
              strokeWidth="10"
              fill="none"
            />
            <path
              d="M205-30C235 70 200 115 240 230S250 300 205 410"
              stroke="#fff"
              strokeWidth="9"
              fill="none"
            />
            <path
              d="M0 292Q160 260 330 298T800 290"
              stroke="#fff"
              strokeWidth="9"
              fill="none"
            />
            <path
              d="M355 0Q370 110 350 180T350 380"
              stroke="#d2dbe0"
              strokeWidth="4"
              fill="none"
            />
            <g
              fill="#737373"
              fontFamily="Vazirmatn Variable, sans-serif"
              fontSize="13"
            >
              <text x="680" y="67">
                {actualCity === "تهران"
                  ? t("زعفرانیه", "Zaferaniyeh")
                  : t("شمال شهر", "North")}
              </text>
              <text x="348" y="120">
                {t("بوستان", "Park")}
              </text>
              <text x="260" y="341">
                {actualCity === "تهران"
                  ? t("شهرک اکباتان", "Ekbatan")
                  : t("مرکز شهر", "City centre")}
              </text>
              <text x="600" y="283">
                {t("فضای سبز", "Green space")}
              </text>
            </g>
          </svg>
          {locations.map((l) => {
            const shift = shifts.find((s) => s.location_id === l.id);
            const x =
              9 +
              ((l.longitude - bounds.minX) / (bounds.maxX - bounds.minX)) * 82;
            const y =
              12 +
              ((bounds.maxY - l.latitude) / (bounds.maxY - bounds.minY)) * 74;
            return (
              <button
                key={l.id}
                className={`map-pin ${shift ? "live" : "inactive"} ${selected === l.id ? "selected" : ""}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                aria-label={`${l.name} - ${shift ? t("در حال اجرا", "Active") : t("بدون شیفت فعال", "No active shift")}`}
                onClick={() => {
                  setSelected(l.id);
                  if (shift) selectShift(shift.id);
                  else open({ kind: "location-detail", id: l.id });
                }}
              >
                <span className="pin-dot">
                  <MapPin size={15} fill="currentColor" strokeWidth={1.6} />
                </span>
                <span className="pin-label">
                  {l.name}
                  {shift && <i />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="map-controls">
          <button
            aria-label={t("بزرگ‌نمایی", "Zoom in")}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
            disabled={zoom >= 2}
          >
            <Plus size={17} />
          </button>
          <button
            aria-label={t("کوچک‌نمایی", "Zoom out")}
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            disabled={zoom <= 1}
          >
            <Minus size={17} />
          </button>
        </div>
        <span className="map-note">
          {t(
            "نمای شماتیک · موقعیت واقعی نقاط",
            "Schematic · actual point coordinates",
          )}
        </span>
        <span className="map-compass">
          N
          <svg viewBox="0 0 16 20">
            <path d="m8 1 6 17-6-4-6 4L8 1Z" fill="#242424" />
          </svg>
        </span>
      </div>
      <div className="map-footer">
        <div>
          <span className="live-indicator" />
          <strong>{n(shifts.length)}</strong>
          <span>{t("نقطه در حال اجرا", "active points")}</span>
          <span className="map-legend-separator" />{" "}
          <span className="muted-dot" />
          <span>
            {n(locations.length)} {t("نقطه ثبت‌شده", "saved points")}
          </span>
        </div>
        {planner && (
          <button
            className="text-button"
            onClick={() => open({ kind: "location" })}
          >
            <Plus size={15} />
            {t("نقطه جدید", "Add point")}
          </button>
        )}
      </div>
    </article>
  );
}
