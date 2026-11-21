"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowDownToLine,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  FileCheck2,
  Layers3,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Radio,
  Sparkles,
  Sun,
  UserCheck,
} from "lucide-react";
import { useWorkspace } from "./context";
import {
  Arrow,
  Avatar,
  Badge,
  Button,
  CardHeading,
  Empty,
  Progress,
  Select,
} from "./ui";
import { PageHeading, DataTable } from "./collections";
import {
  DistributionChart,
  GoalCard,
  OperationsMap,
  OverviewStats,
} from "./charts";
import type { Campaign } from "@/lib/types";
import { dayKey } from "@/lib/api";

export function CampaignRows({ rows }: { rows: Campaign[] }) {
  const { data, t, n, date, selectCampaign } = useWorkspace();
  return (
    <DataTable
      rows={rows}
      pageSize={5}
      columns={[
        {
          label: t("کمپین / برند", "Campaign / brand"),
          render: (c) => (
            <button
              className="campaign-cell"
              onClick={() => selectCampaign(c.id)}
            >
              <span className={`brand-tile ${c.color}`}>
                {c.brand_name.slice(0, 1)}
              </span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.brand_name} <span className="inline-dot">·</span>{" "}
                  {c.product_name}
                </small>
              </span>
            </button>
          ),
        },
        {
          label: t("وضعیت", "Status"),
          render: (c) => <Badge value={c.status} />,
        },
        {
          label: t("نقاط اجرا", "Points"),
          render: (c) => (
            <span className="cell-icon">
              <MapPin size={14} />
              {n(c.points)} {t("نقطه", "points")}
            </span>
          ),
        },
        {
          label: t("پیشرفت توزیع", "Distribution progress"),
          render: (c) => (
            <div className="table-progress">
              <span>
                <strong>{n(c.distributed)}</strong>
                <small>
                  {t("از", "of")} {n(c.target)}
                </small>
                <b>{n(Math.round((c.distributed / c.target) * 100))}٪</b>
              </span>
              <Progress value={(c.distributed / c.target) * 100} compact />
            </div>
          ),
        },
        {
          label: t("تیم اجرا", "Field team"),
          render: (c) => {
            const team = Array.from(
              new Map(
                data.shifts
                  .filter((s) => s.campaign_id === c.id)
                  .flatMap((s) => s.team)
                  .map((p) => [p.id, p]),
              ).values(),
            );
            return (
              <div className="avatar-stack">
                {team.slice(0, 3).map((p) => (
                  <Avatar
                    key={p.id}
                    name={p.name}
                    color={p.color}
                    size="small"
                  />
                ))}
                {team.length > 3 && (
                  <span className="avatar extra small">
                    +{n(team.length - 3)}
                  </span>
                )}
                {!team.length && <span className="muted">—</span>}
              </div>
            );
          },
        },
        {
          label: t("جزئیات", "Details"),
          className: "action-column",
          render: (c) => (
            <button
              className="icon-button table-action"
              aria-label={`${t("جزئیات کمپین", "Campaign details")} ${c.name}`}
              onClick={() => selectCampaign(c.id)}
            >
              <Arrow size={17} />
            </button>
          ),
        },
      ]}
    />
  );
}
export default function Overview() {
  const { data, t, n, date, open, planner, reviewer } = useWorkspace();
  const [days, setDays] = useState(7);
  const [campaignStatus, setCampaignStatus] = useState("active");
  const total = data.trend.slice(-days).reduce((s, d) => s + d.distributed, 0);
  return (
    <>
      <section className="command-hero" data-tour="page">
        <div className="command-copy">
          <span className="hero-kicker">
            <span className="square-dot" />
            FARACODE FOR OPERATIONS
          </span>
          <h1>
            {t("از برنامه تا میدان،", "From plan to field.")}
            <br />
            {t("همه‌چیز در دست شما.", "Make every move count.")}
          </h1>
          <p>
            {t("سلام", "Hello")} {data.user.name.split(" ")[0]}؛{" "}
            {t(
              "کمپین‌ها، تیم‌ها و اجرای امروز را با دیدی روشن مدیریت کنید.",
              "bring your campaigns, people, and every activation into focus.",
            )}
          </p>
          <div className="hero-actions">
            {planner && (
              <Button
                icon={Plus}
                variant="primary"
                onClick={() => open({ kind: "campaign" })}
              >
                {t("ساخت کمپین جدید", "Create a campaign")}
              </Button>
            )}
            {reviewer && (
              <Button
                icon={ArrowDownToLine}
                onClick={() => open({ kind: "export" })}
              >
                {t("دریافت گزارش", "Export report")}
              </Button>
            )}
            {!planner && (
              <Link href="/shifts" className="button primary">
                {t("ورود به شیفت‌ها", "Open your shifts")}
                <Arrow size={18} />
              </Link>
            )}
          </div>
        </div>
        <div className="command-art">
          <Image
            src="/brand/operations-still-life.png"
            alt={t(
              "کیت سمپلینگ، نمونه‌های محصول و نشان موقعیت",
              "A sampling kit, product samples, and a location marker",
            )}
            width={720}
            height={480}
            preload
            sizes="(max-width: 720px) 100vw, 45vw"
          />
          <div className="art-caption">
            <span className="live-indicator" />
            {n(data.campaigns.filter((c) => c.status === "active").length)}{" "}
            {t(
              "کمپین فعال. یک فضای یکپارچه.",
              "active campaigns. One connected workspace.",
            )}
          </div>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR OPERATIONS, AT A GLANCE</span>
          <h2>
            {t("تصویر بزرگ، جزئیات دقیق", "The big picture. Every detail.")}
          </h2>
        </div>
        <Select
          aria-label={t("بازه نمودار", "Chart range")}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>{t("۷ روز گذشته", "Last 7 days")}</option>
          <option value={14}>{t("۱۴ روز گذشته", "Last 14 days")}</option>
        </Select>
      </div>
      <OverviewStats days={days} />
      <div className="overview-top-grid">
        <article className="card performance-card">
          <CardHeading
            title={t("عملکرد توزیع", "Distribution performance")}
            subtitle={t(
              "مقایسه تعداد نمونه با هدف تعیین‌شده",
              "Actual samples compared with planned targets",
            )}
            action={
              <span className="period-note">
                {n(days)} {t("روز گذشته", "days")}
              </span>
            }
          />
          <div className="performance-summary">
            <strong>{n(total)}</strong>
            <span>{t("نمونه توزیع‌شده", "samples distributed")}</span>
            <div className="chart-legend">
              <span>
                <i />
                {t("توزیع واقعی", "Distributed")}
              </span>
              <span>
                <i className="target" />
                {t("هدف روزانه", "Daily target")}
              </span>
            </div>
          </div>
          <DistributionChart days={days} />
        </article>
        <GoalCard />
      </div>
      <div className="section-heading compact-heading">
        <h2>{t("قدم بعدی را بردارید", "Your next move")}</h2>
        <span>
          {t(
            "ابزار درست، درست در دسترس شما",
            "The right tools, right where you need them",
          )}
        </span>
      </div>
      <div className="shortcut-grid">
        {[
          {
            href: "/campaigns",
            image: "campaign-kit",
            title: t("کمپین‌ها", "Campaigns"),
            description: t(
              "از ایده تا اجرای دقیق",
              "From the first idea to activation",
            ),
          },
          {
            href: "/shifts",
            image: "location-pin",
            title: t("شیفت و برنامه‌ریزی", "Shifts & schedule"),
            description: t(
              "هر اجرا، در زمان و مکان درست",
              "The right place. The right time.",
            ),
          },
          {
            href: "/team",
            image: "team-badge",
            title: t("تیم شما", "Your people"),
            description: t(
              "هماهنگ، آماده و در ارتباط",
              "Connected and ready to go",
            ),
          },
          {
            href: "/reports",
            image: "report-clipboard",
            title: t("گزارش‌ها و تأییدها", "Reports & reviews"),
            description: t(
              "تصمیم بهتر با دیدی کامل‌تر",
              "A clearer view. Better decisions.",
            ),
          },
        ].map((item) => (
          <Link href={item.href} className="shortcut-card" key={item.href}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
              <span className="shortcut-arrow">
                <Arrow size={18} />
              </span>
            </span>
            <img
              src={`/brand/${item.image}.svg`}
              width={108}
              height={108}
              alt=""
              loading="lazy"
            />
          </Link>
        ))}
      </div>
      <div className="overview-map-grid">
        <OperationsMap />
        <ActivityCard />
      </div>
      <article className="card campaigns-overview">
        <CardHeading
          title={t("کمپین‌های شما", "Your campaigns")}
          subtitle={t(
            "وضعیت اجرا، پیشرفت و تیم هر کمپین",
            "Status, performance, and the people making it happen",
          )}
          action={
            <Link href="/campaigns" className="text-button">
              {t("همه کمپین‌ها", "All campaigns")}
              <Arrow size={15} />
            </Link>
          }
        />
        <div className="card-tabs">
          <button
            className={campaignStatus === "active" ? "active" : ""}
            onClick={() => setCampaignStatus("active")}
          >
            {t("در حال اجرا", "Active")}
            <span>
              {n(data.campaigns.filter((c) => c.status === "active").length)}
            </span>
          </button>
          <button
            className={campaignStatus === "scheduled" ? "active" : ""}
            onClick={() => setCampaignStatus("scheduled")}
          >
            {t("پیش رو", "Upcoming")}
          </button>
          <button
            className={campaignStatus === "all" ? "active" : ""}
            onClick={() => setCampaignStatus("all")}
          >
            {t("همه کمپین‌ها", "All campaigns")}
          </button>
        </div>
        <CampaignRows
          rows={data.campaigns.filter(
            (c) => campaignStatus === "all" || c.status === campaignStatus,
          )}
        />
      </article>
      <div className="page-footnote">
        <span className="footnote-mark">
          <Sparkles size={14} />
          {t(
            "با همراهی شما، هر اجرا بهتر از دیروز.",
            "Together, making every activation better.",
          )}
        </span>
        <span>
          FARACODE <span className="inline-dot">/</span>{" "}
          {t("ساخته‌شده برای میدان", "MADE FOR THE FIELD")}
        </span>
      </div>
    </>
  );
}
export function ActivityCard() {
  const { data, t, n, date, time, selectShift, selectCampaign, open } =
    useWorkspace();
  const items = data.events.slice(0, 4);
  const icons = [CircleCheck, Package, FileCheck2, UserCheck];
  return (
    <article className="card activity-card">
      <CardHeading
        title={t("آخرین اتفاق‌های میدان", "Fresh from the field")}
        subtitle={t(
          "تیم شما، یک لحظه هم متوقف نمی‌شود",
          "Your team keeps things moving",
        )}
        action={
          <span className="activity-live">
            <Radio size={15} />
            {t("به‌روز", "Live")}
          </span>
        }
      />
      <div className="activity-list">
        {items.length ? (
          items.map((event, i) => {
            const Icon = icons[i % icons.length];
            const mins = Math.max(
              0,
              Math.round(
                (new Date(data.server_time).getTime() -
                  new Date(event.created_at).getTime()) /
                  60000,
              ),
            );
            return (
              <button
                key={event.id}
                className="activity-item"
                onClick={() =>
                  event.entity_type === "shift"
                    ? selectShift(event.entity_id)
                    : event.entity_type === "campaign"
                      ? selectCampaign(event.entity_id)
                      : open({ kind: "audit" })
                }
              >
                <span
                  className={`activity-icon ${["teal", "blue", "purple", "amber"][i % 4]}`}
                >
                  <Icon size={17} />
                </span>
                <span className="activity-copy">
                  <strong>{event.detail}</strong>
                  <span>
                    <Avatar
                      name={event.actor_name}
                      color={event.color}
                      size="small"
                    />
                    {event.actor_name}
                    <i />{" "}
                    {mins < 60
                      ? n(mins) + " " + t("دقیقه پیش", "min ago")
                      : dayKey(event.created_at) === dayKey(data.server_time)
                        ? time(event.created_at)
                        : date(event.created_at, {
                            year: undefined,
                            day: "numeric",
                            month: "short",
                          })}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <Empty title={t("هنوز فعالیتی ثبت نشده", "No activity yet")} />
        )}
      </div>
      <button className="activity-more" onClick={() => open({ kind: "audit" })}>
        {t("مشاهده همه فعالیت‌ها", "View activity history")}
        <Arrow size={15} />
      </button>
    </article>
  );
}
