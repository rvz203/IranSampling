"use client";
import { mapLocationUrl } from "./iran-map";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  Flag,
  LayoutGrid,
  List,
  LocateFixed,
  MapPin,
  Navigation,
  Package,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  Campaign,
  Issue,
  Location,
  Person,
  Report,
  Shift,
} from "@/lib/types";
import { dayKey } from "@/lib/api";
import { useWorkspace } from "./context";
import {
  Arrow,
  Avatar,
  Badge,
  Button,
  Empty,
  Progress,
  RoleLabel,
  Select,
} from "./ui";

export function ViewSwitcher({
  value,
  onChange,
  board = false,
}: {
  value: string;
  onChange: (value: string) => void;
  board?: boolean;
}) {
  const { t } = useWorkspace();
  return (
    <div
      className="view-switch"
      role="group"
      aria-label={t("نوع نمایش", "Display mode")}
    >
      <button
        type="button"
        aria-pressed={value !== "list"}
        className={value !== "list" ? "active" : ""}
        aria-label={
          board ? t("نمای برد", "Board view") : t("نمای کارت", "Grid view")
        }
        onClick={() => onChange(board ? "board" : "grid")}
      >
        <LayoutGrid size={17} />
      </button>
      <button
        type="button"
        aria-pressed={value === "list"}
        className={value === "list" ? "active" : ""}
        aria-label={t("نمای فهرست", "List view")}
        onClick={() => onChange("list")}
      >
        <List size={18} />
      </button>
    </div>
  );
}

export function InsightStrip({
  items,
}: {
  items: {
    label: string;
    value: string;
    detail?: string;
    icon: React.ComponentType<{ size?: number }>;
    action?: () => void;
  }[];
}) {
  return (
    <div className="page-insights">
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <span className="insight-symbol">
              <Icon size={20} />
            </span>
            <span className="insight-copy">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {item.detail && <small>{item.detail}</small>}
            </span>
            {item.action && <Arrow size={16} />}
          </>
        );
        return item.action ? (
          <button
            type="button"
            key={item.label}
            onClick={item.action}
            className="page-insight actionable"
          >
            {content}
          </button>
        ) : (
          <article className="page-insight" key={item.label}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

function CardGrid<T extends { id: string }>({
  rows,
  children,
  className = "",
  pageSize = 6,
  empty,
}: {
  rows: T[];
  children: (row: T) => ReactNode;
  className?: string;
  pageSize?: number;
  empty: string;
}) {
  const { t, n, locale } = useWorkspace();
  const [page, setPage] = useState(1);
  const pages = Math.ceil(rows.length / pageSize);
  const current = Math.max(1, Math.min(page, pages));
  if (!rows.length)
    return (
      <Empty
        title={empty}
        description={t(
          "فیلتر را تغییر دهید یا یک مورد جدید اضافه کنید.",
          "Try a different filter or add a new item.",
        )}
      />
    );
  return (
    <>
      <div className={`rich-card-grid ${className}`}>
        {rows.slice((current - 1) * pageSize, current * pageSize).map((row) => (
          <div className="rich-card-slot" key={row.id}>
            {children(row)}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="table-footer">
          <span>
            {n((current - 1) * pageSize + 1)}–
            {n(Math.min(current * pageSize, rows.length))} {t("از", "of")}{" "}
            {n(rows.length)}
          </span>
          <div className="pagination">
            <button
              aria-label={t("صفحه قبل", "Previous page")}
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              {locale === "fa" ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
            <span>{n(current)}</span>
            <button
              aria-label={t("صفحه بعد", "Next page")}
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              {locale === "fa" ? (
                <ChevronLeft size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function CampaignGrid({ rows }: { rows: Campaign[] }) {
  const { data, t, n, date, selectCampaign } = useWorkspace();
  return (
    <CardGrid
      rows={rows}
      className="campaign-card-grid"
      empty={t("کمپینی با این مشخصات پیدا نشد", "No matching campaigns")}
    >
      {(c) => {
        const team = Array.from(
          new Map(
            data.shifts
              .filter((s) => s.campaign_id === c.id)
              .flatMap((s) => s.team)
              .map((p) => [p.id, p]),
          ).values(),
        );
        return (
          <article className={`rich-campaign-card ${c.color}`}>
            <div className="campaign-card-visual">
              <div>
                <span className="brand-name-label">{c.brand_name}</span>
                <span>{c.product_name}</span>
              </div>
              <img
                src="/brand/campaign-kit.svg"
                width={138}
                height={115}
                alt=""
                loading="lazy"
              />
              <Badge value={c.status} />
            </div>
            <div className="campaign-card-body">
              <button
                className="rich-title"
                onClick={() => selectCampaign(c.id)}
              >
                <h2>{c.name}</h2>
                <Arrow size={17} />
              </button>
              <p className="campaign-card-brief">
                {c.description || c.customer_name}
              </p>
              <div className="campaign-card-numbers">
                <strong>
                  {n(c.distributed)} <small>{t("نمونه", "samples")}</small>
                </strong>
                <span>{n(Math.round((c.distributed / c.target) * 100))}٪</span>
              </div>
              <Progress value={(c.distributed / c.target) * 100} />
              <div className="campaign-card-target">
                {t("هدف توزیع", "Target")} {n(c.target)} {t("نمونه", "samples")}
              </div>
              <div className="rich-meta-row">
                <span>
                  <MapPin size={14} />
                  {n(c.points)} {t("نقطه", "locations")}
                </span>
                <span>
                  <CalendarDays size={14} />
                  {date(c.end_date + "T12:00:00", {
                    year: undefined,
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <div className="rich-card-footer">
                <div className="avatar-stack">
                  {team.slice(0, 3).map((p) => (
                    <Avatar
                      key={p.id}
                      name={p.name}
                      color={p.color}
                      size="small"
                    />
                  ))}
                  {!team.length && (
                    <span className="muted">
                      {t("در انتظار تکمیل تیم", "Team to be assigned")}
                    </span>
                  )}
                  {team.length > 3 && (
                    <span className="avatar small extra">
                      +{n(team.length - 3)}
                    </span>
                  )}
                </div>
                <button
                  className="text-button"
                  onClick={() => selectCampaign(c.id)}
                >
                  {t("جزئیات کمپین", "View campaign")}
                  <Arrow size={15} />
                </button>
              </div>
            </div>
          </article>
        );
      }}
    </CardGrid>
  );
}

export function ShiftAgenda({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const { data, t, n, date } = useWorkspace();
  const days = Array.from(new Set(data.shifts.map((s) => dayKey(s.starts_at))))
    .sort()
    .slice(-7);
  if (!days.length) return null;
  return (
    <section
      className="shift-agenda"
      aria-label={t("روزهای اجرا", "Activation dates")}
    >
      <div className="agenda-title">
        <span className="agenda-icon">
          <CalendarDays size={23} />
        </span>
        <div>
          <strong>{t("تقویم اجرای شما", "Your activation calendar")}</strong>
          <p>
            {t(
              "یک روز را برای دیدن شیفت‌های آن انتخاب کنید.",
              "Pick a date to focus on its shifts.",
            )}
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => onSelect(null)}
          aria-pressed={selected === null}
        >
          {t("همه روزها", "All dates")}
        </button>
      </div>
      <div className="agenda-days">
        {days.map((day) => {
          const count = data.shifts.filter(
            (s) => dayKey(s.starts_at) === day,
          ).length;
          return (
            <button
              type="button"
              key={day}
              className={selected === day ? "selected" : ""}
              aria-pressed={selected === day}
              onClick={() => onSelect(selected === day ? null : day)}
            >
              <span>
                {date(day + "T12:00:00", {
                  year: undefined,
                  month: undefined,
                  day: undefined,
                  weekday: "short",
                })}
              </span>
              <strong>
                {date(day + "T12:00:00", {
                  year: undefined,
                  month: undefined,
                  day: "numeric",
                })}
              </strong>
              <small>
                {date(day + "T12:00:00", {
                  year: undefined,
                  month: "short",
                  day: undefined,
                })}
              </small>
              <span className="agenda-count">
                {n(count)} {t("شیفت", count === 1 ? "shift" : "shifts")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PeopleGrid({ rows }: { rows: Person[] }) {
  const { data, t, n, open } = useWorkspace();
  const today = dayKey(data.server_time);
  return (
    <CardGrid
      rows={rows}
      className="people-card-grid"
      pageSize={9}
      empty={t("همکاری پیدا نشد", "No teammates found")}
    >
      {(p) => {
        const assigned = data.shifts.filter(
          (s) =>
            s.supervisor_id === p.id ||
            s.team.some((member) => member.id === p.id),
        );
        const present = data.attendance.some(
          (a) =>
            a.person_id === p.id &&
            !a.checked_out_at &&
            dayKey(a.checked_in_at) === today,
        );
        return (
          <article className="profile-card">
            <div className={`profile-card-cover ${p.color}`}>
              <span className="profile-cover-pattern" aria-hidden="true" />
              <span className="role-chip">
                <RoleLabel role={p.role} />
              </span>
            </div>
            <div className="profile-card-body">
              <Avatar name={p.name} color={p.color} size="large" />
              <h2>{p.name}</h2>
              <span className="profile-city">
                <MapPin size={14} />
                {p.city}
              </span>
              <div className="profile-metrics">
                <span>
                  <strong>{n(assigned.length)}</strong>
                  <small>{t("شیفت تخصیص‌یافته", "assigned shifts")}</small>
                </span>
                <span>
                  <strong>
                    {n(new Set(assigned.map((s) => s.location_id)).size)}
                  </strong>
                  <small>{t("نقطه مرتبط", "connected points")}</small>
                </span>
              </div>
              <div className="profile-contact" dir="ltr">
                {p.email ||
                  t("اطلاعات تماس محدود است", "Contact details restricted")}
              </div>
              <div className="rich-card-footer">
                {present ? (
                  <Badge value="present" />
                ) : (
                  <span className="profile-availability">
                    <span />
                    {t("خارج از شیفت امروز", "Off shift today")}
                  </span>
                )}
                <button
                  className="text-button"
                  onClick={() => open({ kind: "person-detail", id: p.id })}
                >
                  {t("مشخصات", "View profile")}
                  <Arrow size={15} />
                </button>
              </div>
            </div>
          </article>
        );
      }}
    </CardGrid>
  );
}

export function LocationCards({ rows }: { rows: Location[] }) {
  const { data, t, n, open } = useWorkspace();
  return (
    <CardGrid
      rows={rows}
      className="location-card-grid"
      empty={t("نقطه‌ای پیدا نشد", "No locations found")}
    >
      {(l) => {
        const active = data.shifts.filter(
          (s) => s.location_id === l.id && s.status === "active" && !s.ended_at,
        );
        return (
          <article className="location-card">
            <div className="location-card-top">
              <span className="location-symbol">
                <MapPin size={22} />
              </span>
              <span className="location-city">{l.city}</span>
              {active.length > 0 && <Badge value="active" />}
            </div>
            <button
              className="rich-title"
              onClick={() => open({ kind: "location-detail", id: l.id })}
            >
              <h2>{l.name}</h2>
              <Arrow size={17} />
            </button>
            <p>{l.address || t("نشانی ثبت نشده", "No address added")}</p>
            <div className="location-mini-map" aria-hidden="true">
              <span />
              <span />
              <span />
              <MapPin size={27} fill="#111" color="#111" />
            </div>
            <div className="location-card-facts">
              <span>
                <LocateFixed size={14} />
                {t("شعاع مجاز", "Radius")}{" "}
                <b>
                  {n(l.radius)} {t("متر", "m")}
                </b>
              </span>
              <span>
                <CalendarDays size={14} />
                <b>{n(active.length)}</b> {t("شیفت فعال", "active shifts")}
              </span>
            </div>
            <div className="rich-card-footer">
              <button
                className="text-button"
                onClick={() => open({ kind: "location-detail", id: l.id })}
              >
                {t("جزئیات نقطه", "Point details")}
                <Arrow size={15} />
              </button>
              <a
                className="directions-chip"
                href={mapLocationUrl(l.latitude, l.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={14} />
                {t("باز کردن نقشه", "Open map")}
              </a>
            </div>
          </article>
        );
      }}
    </CardGrid>
  );
}

export function StockOverview({ shifts }: { shifts: Shift[] }) {
  const { t, n, open } = useWorkspace();
  const received = shifts.reduce((v, s) => v + s.received, 0);
  const values = [
    {
      label: t("توزیع‌شده", "Distributed"),
      value: shifts.reduce((v, s) => v + s.distributed, 0),
      kind: "distributed",
    },
    {
      label: t("موجودی قابل‌استفاده", "Available"),
      value: shifts.reduce((v, s) => v + s.remaining, 0),
      kind: "available",
    },
    {
      label: t("آسیب‌دیده و برگشتی", "Damaged & returned"),
      value: shifts.reduce((v, s) => v + s.damaged + s.returned, 0),
      kind: "other",
    },
  ];
  const low = [...shifts]
    .filter((s) => s.received > 0 && s.remaining < 100)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 3);
  return (
    <div className="stock-overview">
      <article className="card stock-flow-card">
        <div className="panel-title">
          <span>
            <Package size={19} />
            {t("مسیر هر نمونه روشن است", "Every sample has a clear path")}
          </span>
          <small>{t("شیفت‌های فعال", "Active shifts")}</small>
        </div>
        <strong className="stock-received">
          {n(received)}{" "}
          <small>{t("نمونه دریافت‌شده", "samples received")}</small>
        </strong>
        <div
          className="stock-flow-bar"
          role="img"
          aria-label={values.map((v) => v.label + ": " + n(v.value)).join("، ")}
        >
          {values.map((v) => (
            <span
              key={v.kind}
              className={v.kind}
              style={{ width: `${received ? (v.value / received) * 100 : 0}%` }}
            />
          ))}
        </div>
        <div className="stock-flow-legend">
          {values.map((v) => (
            <span key={v.kind}>
              <i className={v.kind} />
              <small>{v.label}</small>
              <strong>{n(v.value)}</strong>
            </span>
          ))}
        </div>
      </article>
      <article className="card restock-card">
        <div className="panel-title">
          <span>
            <Flag size={19} />
            {t("اولویت تأمین مجدد", "Replenishment priorities")}
          </span>
        </div>
        {low.length ? (
          low.map((s) => (
            <div className="restock-row" key={s.id}>
              <span>
                <strong>{s.location_name}</strong>
                <small>
                  {n(s.remaining)} {t("نمونه باقی‌مانده", "samples left")}
                </small>
              </span>
              <button
                className="text-button"
                onClick={() => open({ kind: "stock", id: s.id })}
              >
                <Plus size={15} />
                {t("ثبت موجودی", "Add stock")}
              </button>
            </div>
          ))
        ) : (
          <div className="stock-healthy">
            <span>
              <CheckCircle2 size={26} />
            </span>
            <div>
              <strong>
                {!shifts.length
                  ? t(
                      "شیفت فعالی برای تأمین وجود ندارد",
                      "No active shifts to replenish",
                    )
                  : t(
                      "هیچ نقطه‌ای نزدیک به اتمام موجودی نیست",
                      "No points are running low",
                    )}
              </strong>
              <p>
                {!shifts.length
                  ? t(
                      "با شروع شیفت، موجودی و اولویت تأمین اینجا نمایش داده می‌شود.",
                      "Stock and replenishment priorities appear when a shift starts.",
                    )
                  : t(
                      "هیچ شیفتی با موجودی دریافت‌شده، کمتر از ۱۰۰ نمونه باقی‌مانده ندارد.",
                      "No stocked shift has fewer than 100 samples remaining.",
                    )}
              </p>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

export function AttendanceInsight() {
  const { data, t, n, open } = useWorkspace();
  const avg = data.attendance.length
    ? Math.round(
        data.attendance.reduce((v, a) => v + a.in_accuracy, 0) /
          data.attendance.length,
      )
    : 0;
  return (
    <section className="attendance-insight">
      <span className="attendance-insight-icon">
        <LocateFixed size={27} />
      </span>
      <div>
        <h2>
          {t(
            "حضور، با یک نشانه قابل بررسی",
            "Attendance with a traceable location",
          )}
        </h2>
        <p>
          {data.attendance.length
            ? t(
                "میانگین دقت موقعیت ثبت‌شده:",
                "Average recorded location accuracy:",
              ) +
              " " +
              n(avg) +
              " " +
              t("متر", "metres")
            : t(
                "ثبت حضور تیم، همراه با زمان و مختصات نقطه اجرا.",
                "Team attendance, linked to a time and activation location.",
              )}
        </p>
      </div>
      <div className="attendance-steps">
        <span>
          <LocateFixed size={15} />
          {t("موقعیت", "Location")}
        </span>
        <i />
        <span>
          <Clock3 size={15} />
          {t("زمان", "Time")}
        </span>
        <i />
        <span>
          <ShieldCheck size={15} />
          {t("بررسی", "Review")}
        </span>
      </div>
      <button
        className="text-button"
        onClick={() => open({ kind: "attendance-help" })}
      >
        {t("چطور کار می‌کند؟", "How it works")}
        <Arrow size={15} />
      </button>
    </section>
  );
}

export function IssuesBoard({
  rows,
  busy,
  onUpdate,
}: {
  rows: Issue[];
  busy: string | null;
  onUpdate: (id: string, status: string) => void;
}) {
  const { data, t, n, date, open, reviewer } = useWorkspace();
  return (
    <div className="issues-board">
      {["open", "in_progress", "resolved"].map((status) => (
        <section className={`issue-lane ${status}`} key={status}>
          <header>
            <span>
              <i />
              {status === "open"
                ? t("نیازمند اقدام", "To do")
                : status === "in_progress"
                  ? t("در حال پیگیری", "In progress")
                  : t("حل‌شده", "Resolved")}
            </span>
            <b>{n(rows.filter((i) => i.status === status).length)}</b>
          </header>
          <div className="issue-lane-body">
            {rows
              .filter((i) => i.status === status)
              .map((i) => (
                <article className="issue-board-card" key={i.id}>
                  <div className="issue-board-labels">
                    <Badge value={i.priority} />
                    <small>
                      {date(i.created_at, {
                        year: undefined,
                        day: "numeric",
                        month: "short",
                      })}
                    </small>
                  </div>
                  <button
                    className="issue-board-title"
                    onClick={() => open({ kind: "issue-detail", id: i.id })}
                  >
                    {i.title}
                  </button>
                  <p>
                    {i.description ||
                      t("توضیحی ثبت نشده است.", "No description added.")}
                  </p>
                  <span className="issue-board-point">
                    <MapPin size={13} />
                    {i.location_name}
                  </span>
                  <div className="issue-owner">
                    <Avatar name={i.owner_name} size="small" />
                    <span>{i.owner_name}</span>
                  </div>
                  {reviewer && (
                    <Select
                      value={i.status}
                      disabled={
                        busy === i.id ||
                        (i.priority === "urgent" &&
                          data.shifts.some(
                            (s) =>
                              s.id === i.shift_id && s.status === "completed",
                          ))
                      }
                      title={t(
                        "مشکلات فوریِ شیفت تأییدشده باید حل‌شده باقی بمانند",
                        "Urgent issues on approved shifts must remain resolved",
                      )}
                      aria-label={`${t("وضعیت", "Status")} ${i.title}`}
                      onChange={(e) => onUpdate(i.id, e.target.value)}
                    >
                      <option value="open">{t("باز", "Open")}</option>
                      <option value="in_progress">
                        {t("در حال پیگیری", "In progress")}
                      </option>
                      <option value="resolved">
                        {t("حل‌شده", "Resolved")}
                      </option>
                    </Select>
                  )}
                </article>
              ))}
            {!rows.some((i) => i.status === status) && (
              <div className="issue-lane-empty">
                <CheckCircle2 size={24} />
                <strong>{t("اینجا همه‌چیز مرتب است", "All clear here")}</strong>
                <span>
                  {t(
                    "موردی در این ستون وجود ندارد.",
                    "No issues in this column.",
                  )}
                </span>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ReportCards({ rows }: { rows: Report[] }) {
  const { data, t, n, date, open, reviewer } = useWorkspace();
  return (
    <CardGrid
      rows={rows}
      className="report-card-grid"
      empty={t("گزارشی پیدا نشد", "No reports found")}
    >
      {(r) => {
        const shift = data.shifts.find((s) => s.id === r.shift_id);
        const evidence = data.evidence.filter(
          (e) => e.shift_id === r.shift_id,
        ).length;
        return (
          <article className="report-card">
            <div className="report-card-top">
              <span className="report-card-icon">
                <FileText size={25} />
              </span>
              <Badge value={r.status} />
            </div>
            <button
              className="rich-title"
              onClick={() => open({ kind: "report-detail", id: r.id })}
            >
              <h2>{r.location_name}</h2>
              <Arrow size={16} />
            </button>
            <span className="report-campaign">{r.campaign_name}</span>
            <p className="report-card-summary">{r.summary}</p>
            <div className="report-card-values">
              <span>
                <strong>{n(shift?.distributed || 0)}</strong>
                <small>{t("نمونه توزیع‌شده", "distributed samples")}</small>
              </span>
              <span>
                <strong>{n(evidence)}</strong>
                <small>{t("تصویر اجرا", "evidence photos")}</small>
              </span>
              <span>
                <strong>{n(shift?.remaining || 0)}</strong>
                <small>{t("موجودی پایان", "closing balance")}</small>
              </span>
            </div>
            <div className="report-submitter">
              <Avatar name={r.submitted_name} size="small" />
              <span>{r.submitted_name}</span>
              <small>
                {date(r.submitted_at, {
                  year: undefined,
                  day: "numeric",
                  month: "short",
                })}
              </small>
            </div>
            <Button
              variant={
                r.status === "pending" && reviewer ? "primary" : "secondary"
              }
              icon={r.status === "pending" ? FileCheck2 : FileText}
              onClick={() =>
                open({
                  kind:
                    r.status === "pending" && reviewer
                      ? "review"
                      : "report-detail",
                  id: r.id,
                })
              }
            >
              {r.status === "pending" && reviewer
                ? t("بررسی و تأیید گزارش", "Review report")
                : t("مشاهده گزارش", "View report")}
              <Arrow size={15} />
            </Button>
          </article>
        );
      }}
    </CardGrid>
  );
}

export function CatalogCards({ kind, query }: { kind: string; query: string }) {
  const { data, t, n, selectCampaign } = useWorkspace();
  const rows = (
    kind === "brand"
      ? data.brands
      : kind === "product"
        ? data.products
        : data.customers
  ).filter((r) => r.name.includes(query));
  return (
    <CardGrid
      rows={rows}
      className="catalog-card-grid"
      empty={t("موردی در کاتالوگ پیدا نشد", "No catalog items found")}
    >
      {(r) => {
        const brand =
          kind === "brand"
            ? data.brands.find((b) => b.id === r.id)
            : kind === "product"
              ? data.brands.find(
                  (b) => b.id === (r as { brand_id?: string }).brand_id,
                )
              : undefined;
        const products =
          kind === "product"
            ? data.products.filter((p) => p.id === r.id)
            : data.products.filter((p) =>
                kind === "brand"
                  ? p.brand_id === r.id
                  : data.brands.some(
                      (b) => b.customer_id === r.id && b.id === p.brand_id,
                    ),
              );
        const campaigns = data.campaigns.filter((c) =>
          kind === "product"
            ? c.product_id === r.id
            : kind === "brand"
              ? c.brand_id === r.id
              : data.brands.some(
                  (b) => b.customer_id === r.id && b.id === c.brand_id,
                ),
        );
        const owner =
          kind === "customer"
            ? t("مشتری", "Client")
            : kind === "brand"
              ? data.customers.find((c) => c.id === brand?.customer_id)?.name
              : brand?.name;
        return (
          <article className="catalog-card">
            <div className={`catalog-card-visual ${brand?.color || "neutral"}`}>
              <span className="catalog-letter">{r.name.slice(0, 1)}</span>
              <img
                src={
                  kind === "customer"
                    ? "/brand/team-badge.svg"
                    : "/brand/campaign-kit.svg"
                }
                width={122}
                height={102}
                alt=""
                loading="lazy"
              />
            </div>
            <div className="catalog-card-body">
              <span className="catalog-item-type">
                {kind === "brand"
                  ? t("برند", "Brand")
                  : kind === "product"
                    ? t("محصول", "Product")
                    : t("مشتری", "Client")}
              </span>
              <h2>{r.name}</h2>
              <p>{owner || "—"}</p>
              <div className="catalog-product-tags">
                {products.slice(0, 3).map((p) => (
                  <span key={p.id}>
                    <Package size={12} />
                    {p.name}
                  </span>
                ))}
                {!products.length && (
                  <span>
                    {t("هنوز محصولی اضافه نشده", "No products added yet")}
                  </span>
                )}
              </div>
              <div className="rich-card-footer">
                <span className="catalog-campaign-count">
                  <CalendarDays size={14} />
                  {n(campaigns.length)} {t("کمپین مرتبط", "related campaigns")}
                </span>
                {campaigns[0] ? (
                  <button
                    className="text-button"
                    onClick={() => selectCampaign(campaigns[0].id)}
                  >
                    {t("مشاهده کمپین", "View campaign")}
                    <Arrow size={15} />
                  </button>
                ) : (
                  <Link href="/campaigns" className="text-button">
                    {t("کمپین‌ها", "Campaigns")}
                    <Arrow size={15} />
                  </Link>
                )}
              </div>
            </div>
          </article>
        );
      }}
    </CardGrid>
  );
}
