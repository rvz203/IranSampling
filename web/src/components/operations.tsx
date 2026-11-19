"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutGrid,
  List,
  MapPin,
  Navigation,
  Plus,
  Search,
  Users,
  Package,
  ShieldCheck,
  UserRoundCheck,
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
  RoleLabel,
  Select,
} from "./ui";
import { CollectionBar, DataTable, PageHeading } from "./collections";
import { CampaignRows } from "./overview";
import { OperationsMap } from "./charts";
import { LiveTeamMap } from "./live-team";
import { mapLocationUrl } from "./iran-map";
import { dayKey } from "@/lib/api";
import {
  CampaignGrid,
  PeopleGrid,
  LocationCards,
  InsightStrip,
  ViewSwitcher,
  ShiftAgenda,
} from "./page-panels";

export function CampaignsView() {
  const { data, t, n, open, planner } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [layout, setLayout] = useState("grid");
  const rows = data.campaigns
    .filter(
      (c) =>
        (status === "all" || c.status === status) &&
        [c.name, c.brand_name, c.product_name, c.customer_name].some((v) =>
          v.includes(q),
        ),
    )
    .sort((a, b) =>
      sort === "progress"
        ? b.distributed / b.target - a.distributed / a.target
        : a.name.localeCompare(b.name, "fa"),
    );
  return (
    <>
      <PageHeading
        eyebrow="CAMPAIGNS"
        title={t("کمپین‌ها", "Campaigns")}
        description={t(
          "همه کمپین‌ها، برندها و هدف‌ها در یک فضای روشن و منظم.",
          "One clear space for your campaigns, brands, and goals.",
        )}
        action={
          planner && (
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => open({ kind: "campaign" })}
            >
              {t("کمپین جدید", "New campaign")}
            </Button>
          )
        }
      />
      <InsightStrip
        items={[
          {
            label: t("در حال اجرا", "Active now"),
            value: n(
              data.campaigns.filter((c) => c.status === "active").length,
            ),
            detail: t(
              "کمپین در مسیر هدف",
              "campaigns moving toward their goals",
            ),
            icon: CheckCircle2,
            action: () => setStatus("active"),
          },
          {
            label: t("نمونه‌های توزیع‌شده", "Samples distributed"),
            value: n(data.campaigns.reduce((v, c) => v + c.distributed, 0)),
            detail: t("در تمام کمپین‌ها", "across all campaigns"),
            icon: Package,
          },
          {
            label: t("برندهای همراه", "Partner brands"),
            value: n(new Set(data.campaigns.map((c) => c.brand_id)).size),
            detail: t(
              "تجربه‌هایی برای ماندن",
              "experiences that make an impression",
            ),
            icon: Users,
          },
        ]}
      />
      <div className="summary-chips">
        {[
          ["all", t("همه کمپین‌ها", "All campaigns")],
          ["active", t("در حال اجرا", "Active")],
          ["scheduled", t("پیش رو", "Upcoming")],
          ["completed", t("پایان‌یافته", "Completed")],
        ].map(([value, label]) => (
          <button
            key={value}
            className={status === value ? "selected" : ""}
            onClick={() => setStatus(value)}
          >
            {value === "active" && <span className="live-indicator" />}
            {label}
            <b>
              {n(
                data.campaigns.filter(
                  (c) => value === "all" || c.status === value,
                ).length,
              )}
            </b>
          </button>
        ))}
      </div>
      <article className="card">
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی کمپین، برند یا مشتری…",
            "Search campaigns, brands, or clients…",
          )}
          count={rows.length}
        >
          <Select
            aria-label={t("مرتب‌سازی کمپین", "Sort campaigns")}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">{t("بر اساس نام", "By name")}</option>
            <option value="progress">
              {t("بیشترین پیشرفت", "Most progress")}
            </option>
          </Select>
          <ViewSwitcher value={layout} onChange={setLayout} />
        </CollectionBar>
        {layout === "grid" ? (
          <CampaignGrid rows={rows} />
        ) : (
          <CampaignRows rows={rows} />
        )}
      </article>
    </>
  );
}
export function ShiftsView() {
  const { data, t, n, date, time, open, selectShift, planner } = useWorkspace();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(
    data.shifts.some((s) => dayKey(s.starts_at) === dayKey(data.server_time))
      ? "today"
      : "active",
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [layout, setLayout] = useState("grid");
  const today = dayKey(data.server_time);
  const rows = data.shifts.filter(
    (s) =>
      (scope === "all" ||
        (scope === "today" && dayKey(s.starts_at) === today) ||
        scope === s.status) &&
      (!selectedDate || dayKey(s.starts_at) === selectedDate) &&
      [s.campaign_name, s.location_name, s.city, s.supervisor_name].some((v) =>
        v.includes(q),
      ),
  );
  return (
    <>
      <PageHeading
        eyebrow="FIELD SCHEDULE"
        title={t("شیفت‌ها و برنامه‌ریزی", "Shifts & schedule")}
        description={t(
          "برنامه‌ریزی شیفت‌ها، تکمیل تیم و یک شروع هماهنگ در هر نقطه.",
          "Plan your shifts, bring your team together, and start in sync.",
        )}
        action={
          planner && (
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => open({ kind: "shift" })}
            >
              {t("شیفت جدید", "New shift")}
            </Button>
          )
        }
      />
      <ShiftAgenda
        selected={selectedDate}
        onSelect={(v) => {
          setSelectedDate(v);
          setScope("all");
        }}
      />
      <article className="card shift-toolbar">
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی نقطه، کمپین یا سرپرست…",
            "Search locations, campaigns, or supervisors…",
          )}
          count={rows.length}
        >
          <Select
            aria-label={t("فیلتر شیفت‌ها", "Filter shifts")}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setSelectedDate(null);
            }}
          >
            <option value="today">
              {t("شیفت‌های امروز", "Today's shifts")}
            </option>
            <option value="scheduled">
              {t("برنامه‌ریزی‌شده", "Scheduled")}
            </option>
            <option value="active">{t("در حال اجرا", "Active")}</option>
            <option value="completed">{t("پایان‌یافته", "Completed")}</option>
            <option value="all">{t("همه شیفت‌ها", "All shifts")}</option>
          </Select>
          <div className="view-switch">
            <button
              aria-label={t("نمای کارت", "Grid view")}
              className={layout === "grid" ? "active" : ""}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label={t("نمای فهرست", "List view")}
              className={layout === "list" ? "active" : ""}
              onClick={() => setLayout("list")}
            >
              <List size={18} />
            </button>
          </div>
        </CollectionBar>
      </article>
      {rows.length === 0 ? (
        <article className="card">
          <Empty
            title={t(
              "برنامه‌ای برای این بازه نداریم",
              "No shifts in this period",
            )}
            description={t(
              "یک شیفت جدید ایجاد کنید یا فیلتر را تغییر دهید.",
              "Create a shift or try a different filter.",
            )}
          />
        </article>
      ) : layout === "grid" ? (
        <div className="shift-grid">
          {rows.map((s) => (
            <article className="card shift-card" key={s.id}>
              <div className="shift-card-top">
                <span className={`brand-label ${s.color}`}>{s.brand_name}</span>
                <Badge value={s.status} />
              </div>
              <button className="shift-title" onClick={() => selectShift(s.id)}>
                <h2>{s.location_name}</h2>
                <Arrow size={18} />
              </button>
              <p className="shift-campaign">{s.campaign_name}</p>
              <div className="shift-meta">
                <span>
                  <MapPin size={15} />
                  {s.city}
                </span>
                <span>
                  <Clock3 size={15} />
                  {time(s.starts_at)} – {time(s.ends_at)}
                </span>
                <span>
                  <CalendarDays size={15} />
                  {date(s.starts_at, { day: "numeric", month: "short" })}
                </span>
              </div>
              <div className="shift-progress">
                <span>
                  {t("توزیع نمونه", "Sample distribution")}
                  <b>
                    {n(s.distributed)} <small>/ {n(s.target)}</small>
                  </b>
                </span>
                <Progress value={(s.distributed / s.target) * 100} />
              </div>
              <div className="shift-card-bottom">
                <div className="avatar-stack">
                  {s.team.slice(0, 3).map((p) => (
                    <Avatar
                      key={p.id}
                      name={p.name}
                      color={p.color}
                      size="small"
                    />
                  ))}
                  {s.team.length === 0 ? (
                    <span className="muted">
                      {t("تیم تکمیل نشده", "Staff needed")}
                    </span>
                  ) : (
                    <span className="team-count">
                      {n(s.team.length)}/{n(s.required_staff)}
                    </span>
                  )}
                </div>
                <span className={`readiness ${s.ready ? "ready" : ""}`}>
                  <CheckCircle2 size={14} />
                  {s.ready
                    ? t("آماده اجرا", "Ready to go")
                    : t("نیاز به بررسی", "Readiness pending")}
                </span>
              </div>
              <button
                className="shift-detail-button"
                onClick={() => selectShift(s.id)}
              >
                {t("ورود به فضای شیفت", "Open shift workspace")}
                <Arrow size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <article className="card">
          <DataTable
            rows={rows}
            columns={[
              {
                label: t("نقطه اجرا", "Location"),
                render: (s) => (
                  <button
                    className="cell-link"
                    onClick={() => selectShift(s.id)}
                  >
                    {s.location_name}
                    <small>{s.campaign_name}</small>
                  </button>
                ),
              },
              { label: t("شهر", "City"), render: (s) => s.city },
              {
                label: t("شروع شیفت", "Starts"),
                render: (s) => (
                  <span>
                    {date(s.starts_at, { day: "numeric", month: "short" })}
                    <small className="block-muted">{time(s.starts_at)}</small>
                  </span>
                ),
              },
              {
                label: t("تیم", "Team"),
                render: (s) => n(s.team.length) + " / " + n(s.required_staff),
              },
              {
                label: t("توزیع", "Distributed"),
                render: (s) => n(s.distributed),
              },
              {
                label: t("وضعیت", "Status"),
                render: (s) => <Badge value={s.status} />,
              },
              {
                label: t("جزئیات", "Details"),
                render: (s) => (
                  <button
                    className="icon-button"
                    onClick={() => selectShift(s.id)}
                    aria-label={t("جزئیات شیفت", "Shift details")}
                  >
                    <Arrow />
                  </button>
                ),
              },
            ]}
          />
        </article>
      )}
    </>
  );
}
export function MapView() {
  const { data, t, n, open, planner } = useWorkspace();
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState("grid");
  const [city, setCity] = useState("all");
  const [campaign, setCampaign] = useState("");
  const scopedShifts = data.shifts.filter(
    (shift) => !campaign || shift.campaign_id === campaign,
  );
  const pointIds = new Set(scopedShifts.map((shift) => shift.location_id));
  const locations = data.locations.filter(
    (location) => !campaign || pointIds.has(location.id),
  );
  const rows = locations.filter(
    (l) =>
      (city === "all" || l.city === city) &&
      [l.name, l.city, l.address].some((v) => v.includes(q)),
  );
  return (
    <>
      <PageHeading
        eyebrow="LOCATIONS"
        title={t("نقشه عملیات", "Operations map")}
        description={t(
          "از نزدیک ببینید تیم شما کجاست و تجربه‌ها کجا ساخته می‌شوند.",
          "See where your team is making good experiences happen.",
        )}
        action={
          planner && (
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => open({ kind: "location" })}
            >
              {t("نقطه جدید", "Add location")}
            </Button>
          )
        }
      />
      <InsightStrip
        items={[
          {
            label: t("نقاط ثبت‌شده", "Saved locations"),
            value: n(locations.length),
            icon: MapPin,
          },
          {
            label: t("شهرهای تحت پوشش", "Cities covered"),
            value: n(new Set(locations.map((l) => l.city)).size),
            icon: Navigation,
          },
          {
            label: t("نقاط در حال اجرا", "Active locations"),
            value: n(
              new Set(
                scopedShifts
                  .filter((s) => s.status === "active")
                  .map((s) => s.location_id),
              ).size,
            ),
            icon: CheckCircle2,
          },
        ]}
      />
      <div className="map-campaign-filter">
        <Select
          aria-label={t("کمپین نقشه", "Map campaign")}
          value={campaign}
          onChange={(event) => {
            setCampaign(event.target.value);
            setCity("all");
          }}
        >
          <option value="">{t("همه کمپین‌ها", "All campaigns")}</option>
          {data.campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>
      {(data.user.role === "admin" || data.user.role === "supervisor") && (
        <LiveTeamMap key={data.user.id + ":" + campaign} campaign={campaign} />
      )}
      <OperationsMap expanded campaign={campaign} />
      <div className="section-heading compact-heading">
        <h2>{t("نقاط اجرا", "Your activation points")}</h2>
        <span>
          {t(
            "جزئیات هر نقطه، درست در دسترس",
            "Every point, with the details that matter",
          )}
        </span>
      </div>
      <article className="card locations-table">
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی نقطه یا شهر…",
            "Search locations or cities…",
          )}
          count={rows.length}
        >
          <Select
            aria-label={t("فیلتر شهر نقاط", "Filter location city")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="all">{t("همه شهرها", "All cities")}</option>
            {Array.from(new Set(locations.map((l) => l.city))).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <ViewSwitcher value={layout} onChange={setLayout} />
        </CollectionBar>
        {layout === "grid" ? (
          <LocationCards rows={rows} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                label: t("نقطه اجرا", "Location"),
                render: (l) => (
                  <button
                    className="cell-link"
                    onClick={() => open({ kind: "location-detail", id: l.id })}
                  >
                    {l.name}
                    <small>{l.address}</small>
                  </button>
                ),
              },
              { label: t("شهر", "City"), render: (l) => l.city },
              {
                label: t("شعاع مجاز حضور", "Attendance radius"),
                render: (l) => n(l.radius) + " " + t("متر", "m"),
              },
              {
                label: t("شیفت‌های فعال", "Active shifts"),
                render: (l) =>
                  n(
                    data.shifts.filter(
                      (s) => s.location_id === l.id && s.status !== "completed",
                    ).length,
                  ),
              },
              {
                label: t("نقشهٔ ایران", "Iran map"),
                render: (l) => (
                  <a
                    className="text-button"
                    href={mapLocationUrl(l.latitude, l.longitude)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={15} />
                    {t("باز کردن نقشه", "Open map")}
                  </a>
                ),
              },
            ]}
          />
        )}
      </article>
    </>
  );
}
export function TeamView() {
  const { data, t, n, open } = useWorkspace();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [layout, setLayout] = useState("grid");
  const rows = data.people.filter(
    (p) =>
      (role === "all" || p.role === role) &&
      [p.name, p.city, p.email].some((v) => v.includes(q)),
  );
  const canManage = data.user.role === "admin" || data.user.role === "manager";
  return (
    <>
      <PageHeading
        eyebrow="OUR PEOPLE"
        title={t("تیم و همکاران", "People & teams")}
        description={t(
          "یک تیم هماهنگ، نقطه شروع هر اجرای عالی است.",
          "A connected team is where every great activation begins.",
        )}
        action={
          canManage && (
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => open({ kind: "person" })}
            >
              {t("همکار جدید", "Add teammate")}
            </Button>
          )
        }
      />
      <InsightStrip
        items={[
          {
            label: t("همراهان تیم", "Your teammates"),
            value: n(data.people.length),
            icon: Users,
            action: () => setRole("all"),
          },
          {
            label: t("سرپرستان", "Supervisors"),
            value: n(data.people.filter((p) => p.role === "supervisor").length),
            icon: ShieldCheck,
            action: () => setRole("supervisor"),
          },
          {
            label: t("نیروهای اجرا", "Field samplers"),
            value: n(data.people.filter((p) => p.role === "sampler").length),
            icon: UserRoundCheck,
            action: () => setRole("sampler"),
          },
        ]}
      />
      <article className="card">
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی نام، شهر یا ایمیل…",
            "Search names, cities, or email…",
          )}
          count={rows.length}
        >
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label={t("فیلتر نقش", "Filter roles")}
          >
            <option value="all">{t("همه نقش‌ها", "All roles")}</option>
            {["admin", "manager", "coordinator", "supervisor", "sampler"].map(
              (v) => (
                <option key={v} value={v}>
                  {
                    {
                      admin: t("مدیر سامانه", "Administrator"),
                      manager: t("مدیر عملیات", "Manager"),
                      coordinator: t("هماهنگ‌کننده", "Coordinator"),
                      supervisor: t("سرپرست", "Supervisor"),
                      sampler: t("سمپلر", "Sampler"),
                    }[v]
                  }
                </option>
              ),
            )}
          </Select>
          <ViewSwitcher value={layout} onChange={setLayout} />
        </CollectionBar>
        {layout === "grid" ? (
          <PeopleGrid rows={rows} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                label: t("همکار", "Teammate"),
                render: (p) => (
                  <div className="person-cell">
                    <Avatar name={p.name} color={p.color} />
                    <span>
                      <strong>{p.name}</strong>
                      <small dir="ltr">{p.email || "—"}</small>
                    </span>
                  </div>
                ),
              },
              {
                label: t("نقش", "Role"),
                render: (p) => (
                  <span className="role-chip">
                    <RoleLabel role={p.role} />
                  </span>
                ),
              },
              {
                label: t("شهر", "City"),
                render: (p) => (
                  <span className="cell-icon">
                    <MapPin size={14} />
                    {p.city}
                  </span>
                ),
              },
              {
                label: t("شیفت‌های تخصیص‌یافته", "Assigned shifts"),
                render: (p) =>
                  n(
                    data.shifts.filter(
                      (s) =>
                        s.team.some((x) => x.id === p.id) ||
                        s.supervisor_id === p.id,
                    ).length,
                  ),
              },
              {
                label: t("حضور امروز", "Today"),
                render: (p) =>
                  data.attendance.some(
                    (a) =>
                      a.person_id === p.id &&
                      !a.checked_out_at &&
                      dayKey(a.checked_in_at) === dayKey(data.server_time),
                  ) ? (
                    <Badge value="present" />
                  ) : (
                    <span className="muted">
                      {t("خارج از شیفت", "Off shift")}
                    </span>
                  ),
              },
              {
                label: t("مشخصات", "Profile"),
                render: (p) => (
                  <button
                    className="icon-button"
                    aria-label={`${t("مشخصات", "Profile")} ${p.name}`}
                    onClick={() => open({ kind: "person-detail", id: p.id })}
                  >
                    <Arrow />
                  </button>
                ),
              },
            ]}
          />
        )}
      </article>
    </>
  );
}
