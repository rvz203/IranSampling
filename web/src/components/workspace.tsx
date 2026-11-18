"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Command,
  FileCheck2,
  Flag,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Megaphone,
  Menu,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  UserRoundCheck,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { api, APIError, errorText, SESSION_EXPIRED_EVENT } from "@/lib/api";
import type { DialogState, Locale, View, WorkspaceData } from "@/lib/types";
import { Context, useWorkspace } from "./context";
import { Avatar, BrandMark, Button, Dialog, Empty, RoleLabel } from "./ui";
import Overview from "./overview";
import { CampaignsView, MapView, ShiftsView, TeamView } from "./operations";
import {
  AttendanceView,
  CatalogView,
  InventoryView,
  IssuesView,
  ReportsView,
} from "./records";
import AppDialog from "./dialogs";
import { CampaignDrawer, ShiftDrawer } from "./drawers";

const navItems: {
  view: View;
  fa: string;
  en: string;
  icon: LucideIcon;
  group?: boolean;
}[] = [
  { view: "overview", fa: "نمای کلی", en: "Overview", icon: LayoutDashboard },
  { view: "campaigns", fa: "کمپین‌ها", en: "Campaigns", icon: Megaphone },
  {
    view: "shifts",
    fa: "شیفت‌ها و برنامه‌ریزی",
    en: "Shifts & schedule",
    icon: CalendarDays,
  },
  { view: "map", fa: "نقشه عملیات", en: "Operations map", icon: MapPin },
  { view: "team", fa: "تیم و همکاران", en: "People & teams", icon: Users },
  {
    view: "attendance",
    fa: "حضور و غیاب",
    en: "Attendance",
    icon: UserRoundCheck,
    group: true,
  },
  {
    view: "inventory",
    fa: "موجودی و توزیع",
    en: "Stock & distribution",
    icon: Package,
  },
  {
    view: "issues",
    fa: "مشکلات و پیگیری‌ها",
    en: "Issues & follow-ups",
    icon: Flag,
  },
  {
    view: "reports",
    fa: "گزارش‌ها و تأییدها",
    en: "Reports & reviews",
    icon: ChartNoAxesCombined,
  },
  {
    view: "catalog",
    fa: "برندها و محصولات",
    en: "Brands & products",
    icon: Building2,
  },
];
export default function Workspace({ view }: { view: View }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [locale, setLocaleState] = useState<Locale>("fa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [demo, setDemo] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const booted = useRef(false);
  const authenticated = useRef(false);
  const sessionRevision = useRef(0);
  const t = useCallback(
    (fa: string, en: string) => (locale === "fa" ? fa : en),
    [locale],
  );
  const n = useCallback(
    (v: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(
        locale === "fa" ? "fa-IR" : "en-US",
        options,
      ).format(v),
    [locale],
  );
  const date = useCallback(
    (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
        timeZone: "Asia/Tehran",
        year: "numeric",
        month: "short",
        day: "numeric",
        ...options,
      }).format(new Date(value)),
    [locale],
  );
  const time = useCallback(
    (value: string | Date) =>
      new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
        timeZone: "Asia/Tehran",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value)),
    [locale],
  );
  const setLocale = useCallback((value: Locale) => {
    setLocaleState(value);
    localStorage.setItem("faracode-locale", value);
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("faracode-locale");
    if (saved === "en" || saved === "fa") setLocaleState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }, [locale]);
  const notify = useCallback((message: string, isError = false) => {
    setToast({ message, error: isError });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const refresh = useCallback(async () => {
    const revision = sessionRevision.current;
    const next = await api<WorkspaceData>("/workspace");
    if (revision !== sessionRevision.current) return;
    authenticated.current = true;
    setData(next);
    setDemo(next.demo);
    setSignedOut(false);
    setError("");
    setSyncError(false);
  }, []);
  useEffect(() => {
    function expired(event: Event) {
      if (!authenticated.current) return;
      authenticated.current = false;
      sessionRevision.current += 1;
      sessionStorage.setItem("faracode-signed-out", "true");
      setData(null);
      setDialog(null);
      setShiftId(null);
      setCampaignId(null);
      setMobileNav(false);
      setToast(null);
      setSyncError(false);
      setSignedOut(true);
      setError((event as CustomEvent<string>).detail);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);
  const close = useCallback(() => setDialog(null), []);
  const mutate = useCallback(
    async (path: string, body?: unknown, method = "POST") => {
      await api(path, {
        method,
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
      try {
        await refresh();
      } catch (error) {
        if (error instanceof APIError && error.status === 401) throw error;
        // The write committed. Keep its success distinct from a failed follow-up read.
        setSyncError(true);
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const config = await api<{ demo: boolean }>("/config");
        setDemo(config.demo);
        try {
          await refresh();
        } catch (e) {
          if (e instanceof APIError && e.status === 401) {
            if (
              config.demo &&
              sessionStorage.getItem("faracode-signed-out") !== "true"
            ) {
              await api("/auth/demo", {
                method: "POST",
                body: JSON.stringify({ role: "admin" }),
              });
              await refresh();
            } else {
              setSignedOut(true);
            }
          } else {
            throw e;
          }
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible")
        refresh().catch((e) => {
          if (e instanceof APIError && e.status === 401) {
            setData(null);
            setSignedOut(true);
          }
        });
    }, 60000);
    return () => clearInterval(interval);
  }, [data?.user.id, refresh]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog((d) => (d?.kind === "search" ? null : { kind: "search" }));
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      sessionStorage.setItem("faracode-signed-out", "true");
      authenticated.current = false;
      sessionRevision.current += 1;
      setData(null);
      setSignedOut(true);
      setDialog(null);
      setShiftId(null);
      setCampaignId(null);
    } catch (e) {
      notify(errorText(e), true);
    }
  }
  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      notify(t("اطلاعات به‌روز شد", "You're up to date"));
    } catch (e) {
      notify(errorText(e), true);
    } finally {
      setRefreshing(false);
    }
  }
  if (loading) return <WorkspaceSkeleton />;
  if (!data) {
    return (
      <Login
        locale={locale}
        setLocale={setLocale}
        demo={demo}
        error={error}
        onLogin={refresh}
        signedOut={signedOut}
      />
    );
  }
  const planner = ["admin", "manager", "coordinator"].includes(data.user.role);
  const reviewer = planner || data.user.role === "supervisor";
  const context = {
    data,
    locale,
    t,
    n,
    date,
    time,
    planner,
    reviewer,
    refresh,
    open: setDialog,
    close,
    notify,
    selectShift: setShiftId,
    selectCampaign: setCampaignId,
    mutate,
  };
  const heading = navItems.find((v) => v.view === view)!;
  const pending = data.reports.filter((r) => r.status === "pending").length;
  const issues = data.issues.filter((i) => i.status !== "resolved").length;
  const views = {
    overview: <Overview />,
    campaigns: <CampaignsView />,
    shifts: <ShiftsView />,
    map: <MapView />,
    team: <TeamView />,
    attendance: <AttendanceView />,
    inventory: <InventoryView />,
    issues: <IssuesView />,
    reports: <ReportsView />,
    catalog: <CatalogView />,
  };
  return (
    <Context.Provider value={context}>
      <a href="#main-content" className="skip-link">
        {t("رفتن به محتوای اصلی", "Skip to content")}
      </a>
      <div className="app-shell">
        {mobileNav && (
          <button
            className="sidebar-scrim"
            aria-label={t("بستن فهرست", "Close navigation")}
            onClick={() => setMobileNav(false)}
          />
        )}
        <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
          <Link
            href="/"
            className="logo-lockup"
            aria-label={t("فراکد، نمای کلی", "FaraCode overview")}
            onClick={() => setMobileNav(false)}
          >
            <BrandMark />
            <span>
              <strong>
                {t("فراکد", "faracode")}
                <i />
              </strong>
              <small>SAMPLING OPERATIONS</small>
            </span>
          </Link>
          <button
            className="workspace-picker"
            onClick={() => setDialog({ kind: "account" })}
          >
            <span className="workspace-emblem">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong>{t("ایران سمپلینگ", "Iran Sampling")}</strong>
              <small>
                {data.demo
                  ? t("فضای کار آزمایشی", "Demo workspace")
                  : t("فضای کار تیم شما", "Your team workspace")}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <nav aria-label={t("فهرست اصلی", "Main navigation")}>
            <span className="nav-group-label">
              {t("فضای کار", "WORKSPACE")}
            </span>
            {navItems.map((item) => (
              <div key={item.view}>
                {item.group && (
                  <span className="nav-group-label operations-label">
                    {t("مدیریت عملیات", "OPERATIONS")}
                  </span>
                )}
                <Link
                  href={item.view === "overview" ? "/" : `/${item.view}`}
                  className={`nav-item ${view === item.view ? "active" : ""}`}
                  aria-current={view === item.view ? "page" : undefined}
                  onClick={() => setMobileNav(false)}
                >
                  <item.icon
                    size={19}
                    strokeWidth={view === item.view ? 1.9 : 1.6}
                  />
                  <span>{t(item.fa, item.en)}</span>
                  {item.view === "reports" && pending > 0 && (
                    <span className="nav-count">{n(pending)}</span>
                  )}
                  {item.view === "issues" && issues > 0 && (
                    <span className="nav-dot" />
                  )}
                </Link>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-help">
              <div className="help-graphic">
                <img
                  src="/brand/report-clipboard.svg"
                  alt=""
                  width={66}
                  height={66}
                />
              </div>
              <h3>{t("برای اجرای بهتر آماده‌اید؟", "Make your next move")}</h3>
              <p>
                {t(
                  "از برنامه تا میدان، همراه شماییم.",
                  "From planning to the field, we're here.",
                )}
              </p>
              <button onClick={() => setDialog({ kind: "help" })}>
                {t("راهنمای شروع", "Take a quick tour")}
                <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="sidebar-utility">
              <button onClick={() => setDialog({ kind: "account" })}>
                <Settings2 size={18} />
                {t("تنظیمات فضای کار", "Workspace settings")}
              </button>
              <button onClick={() => setDialog({ kind: "help" })}>
                <CircleHelp size={18} />
                {t("مرکز راهنما", "Help center")}
              </button>
            </div>
            <button
              className="sidebar-profile"
              onClick={() => setDialog({ kind: "account" })}
            >
              <Avatar name={data.user.name} color={data.user.color} />
              <span>
                <strong>{data.user.name}</strong>
                <small>
                  <RoleLabel role={data.user.role} />
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-start">
              <Link href="/" className="topbar-brand" aria-label="FaraCode">
                <BrandMark />
                <strong>
                  faracode<span>.</span>
                </strong>
                <span className="product-label">
                  {t("عملیات", "Operations")}
                </span>
              </Link>
              <button
                className="icon-button mobile-menu"
                aria-label={t("باز کردن فهرست", "Open navigation")}
                onClick={() => setMobileNav(true)}
              >
                <Menu size={23} />
              </button>
              <div className="breadcrumbs">
                <span>{t("فضای کار", "Workspace")}</span>
                <ChevronLeft size={12} />
                <strong>{t(heading.fa, heading.en)}</strong>
              </div>
            </div>
            <div className="topbar-end">
              <button
                className="global-search"
                aria-label={t("جست‌وجو در فضای کار", "Search workspace")}
                onClick={() => setDialog({ kind: "search" })}
              >
                <Search size={16} />
                <span>{t("چیزی را پیدا کنید…", "Find something…")}</span>
                <kbd>Ctrl K</kbd>
              </button>
              <span className="topbar-divider" />
              <span className="topbar-date">
                <CalendarDays size={16} />
                {date(data.server_time, {
                  year: undefined,
                  month: "long",
                  day: "numeric",
                })}
              </span>
              <button
                className={`icon-button refresh-button ${refreshing ? "spin" : ""}`}
                onClick={manualRefresh}
                disabled={refreshing}
                aria-label={t("به‌روزرسانی اطلاعات", "Refresh data")}
              >
                <RefreshCw size={17} />
              </button>
              <button
                className="icon-button notification-button"
                aria-label={t("اعلان‌ها", "Notifications")}
                onClick={() => setDialog({ kind: "notifications" })}
              >
                <Bell size={20} />
                {pending + issues > 0 && <i />}
              </button>
              <span className="topbar-divider" />
              <button
                className="topbar-avatar"
                aria-label={t("حساب کاربری", "Your account")}
                onClick={() => setDialog({ kind: "account" })}
              >
                <Avatar
                  name={data.user.name}
                  color={data.user.color}
                  size="small"
                />
              </button>
            </div>
          </header>
          <main className="main-content" id="main-content" key={view}>
            {syncError && (
              <div className="sync-notice" role="status">
                <WifiOff size={22} />
                <p>
                  {t(
                    "تغییرات شما ذخیره شد. برای نمایش آخرین اطلاعات، صفحه را تازه‌سازی کنید.",
                    "Your changes were saved. Refresh to load the latest information.",
                  )}
                </p>
                <Button onClick={manualRefresh} loading={refreshing}>
                  {t("به‌روزرسانی اطلاعات", "Refresh data")}
                </Button>
              </div>
            )}
            {views[view]}
          </main>
        </div>
      </div>
      {campaignId && (
        <CampaignDrawer
          key={campaignId}
          id={campaignId}
          onClose={() => setCampaignId(null)}
        />
      )}
      {shiftId && (
        <ShiftDrawer
          key={shiftId}
          id={shiftId}
          onClose={() => setShiftId(null)}
        />
      )}
      {dialog &&
        (dialog.kind === "search" ? (
          <SearchDialog onClose={close} />
        ) : (
          <AppDialog
            key={`${dialog.kind}-${dialog.id || ""}-${dialog.subtype || ""}`}
            state={dialog}
            locale={locale}
            setLocale={setLocale}
            onSignOut={signOut}
          />
        ))}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <Flag size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            aria-label={t("بستن اعلان", "Dismiss notification")}
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function SearchDialog({ onClose }: { onClose: () => void }) {
  const { data, t, selectShift, selectCampaign, open } = useWorkspace();
  const [q, setQ] = useState("");
  const router = useRouter();
  const normalize = (s: string) =>
    s.toLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک");
  const query = normalize(q.trim());
  const results = [
    ...data.campaigns.map((c) => ({
      id: c.id,
      title: c.name,
      detail: c.brand_name,
      icon: Megaphone,
      action: () => selectCampaign(c.id),
    })),
    ...data.locations.map((l) => ({
      id: l.id,
      title: l.name,
      detail: l.city,
      icon: MapPin,
      action: () => open({ kind: "location-detail", id: l.id }),
    })),
    ...data.people.map((p) => ({
      id: p.id,
      title: p.name,
      detail: t("همکار", "Teammate"),
      icon: Users,
      action: () => open({ kind: "person-detail", id: p.id }),
    })),
    ...data.issues.map((i) => ({
      id: i.id,
      title: i.title,
      detail: i.location_name,
      icon: Flag,
      action: () => open({ kind: "issue-detail", id: i.id }),
    })),
  ]
    .filter(
      (r) => !query || normalize(r.title + " " + r.detail).includes(query),
    )
    .slice(0, 9);
  return (
    <Dialog
      title={t("دنبال چه می‌گردید؟", "What are you looking for?")}
      description={t(
        "کمپین، همکار، نقطه یا مسئله‌ای را پیدا کنید.",
        "Find a campaign, person, point, or issue.",
      )}
      onClose={onClose}
    >
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label={t("جست‌وجو در فضای کار", "Search workspace")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("اینجا بنویسید…", "Start typing…")}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="search-results">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              onClose();
              r.action();
            }}
          >
            <r.icon size={20} />
            <span>
              <strong>{r.title}</strong>
              <small>{r.detail}</small>
            </span>
            <ArrowLeft size={17} />
          </button>
        ))}
        {!results.length && (
          <Empty
            title={t(
              "چیزی با این عبارت پیدا نشد",
              "No matches for that search",
            )}
          />
        )}
      </div>
    </Dialog>
  );
}
function Login({
  locale,
  setLocale,
  demo,
  error: initialError,
  onLogin,
  signedOut,
}: {
  locale: Locale;
  setLocale: (v: Locale) => void;
  demo: boolean;
  error: string;
  onLogin: () => Promise<void>;
  signedOut: boolean;
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function login(isDemo = false) {
    setBusy(true);
    setError("");
    try {
      await api(isDemo ? "/auth/demo" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(isDemo ? { role: "admin" } : { email, password }),
      });
      sessionStorage.removeItem("faracode-signed-out");
      await onLogin();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <header className="public-header">
        <Link href="/" className="topbar-brand" aria-label="FaraCode">
          <BrandMark />
          <strong>
            faracode<span>.</span>
          </strong>
          <span className="product-label">{t("عملیات", "Operations")}</span>
        </Link>
        <button
          className="public-language"
          onClick={() => setLocale(locale === "fa" ? "en" : "fa")}
        >
          <Globe2 size={17} />
          {locale === "fa" ? "English" : "فارسی"}
        </button>
      </header>
      <div className="login-layout">
        <section className="login-story">
          <span className="hero-kicker">MADE FOR THE FIELD.</span>
          <h1>
            {t("تجربه‌های کوچک.", "Small experiences.")}
            <br />
            {t("تأثیرهای بزرگ.", "Lasting impressions.")}
          </h1>
          <p>
            {t(
              "تیم‌ها، کمپین‌ها و میدان را در یک فضای یکپارچه به هم متصل کنید.",
              "Bring your people, campaigns, and field together in one connected workspace.",
            )}
          </p>
          <div className="login-art">
            <Image
              src="/brand/operations-still-life.png"
              width={900}
              height={600}
              preload
              sizes="(max-width: 720px) 100vw, 50vw"
              alt={t(
                "کیت اجرای سمپلینگ با نشان موقعیت",
                "A premium field sampling kit and location marker",
              )}
            />
            <div className="login-art-label">
              <span className="square-dot" />
              {t(
                "از اولین برنامه تا آخرین نمونه",
                "FROM THE FIRST PLAN TO THE LAST SAMPLE",
              )}
            </div>
          </div>
          <div className="login-story-footer">
            <span>FARACODE FOR OPERATIONS</span>
            <span>
              {t(
                "همه‌چیز، در مسیر درست.",
                "Everything, moving in the right direction.",
              )}
            </span>
          </div>
        </section>
        <section className="login-form-panel">
          <div className="login-form-content">
            <span className="eyebrow">YOUR WORKSPACE, CONNECTED.</span>
            <h2>
              {signedOut
                ? t("به‌زودی می‌بینیمتان.", "See you out there.")
                : t("خوش آمدید.", "Welcome back.")}
            </h2>
            <p>
              {t(
                "برای مدیریت عملیات، وارد حساب خود شوید.",
                "Sign in to manage your people and operations.",
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                login();
              }}
            >
              <label className="form-field">
                <span>{t("ایمیل کاری", "Work email")}</span>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
              </label>
              <label className="form-field">
                <span>{t("رمز عبور", "Password")}</span>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <Button type="submit" variant="primary" loading={busy}>
                {t("ورود به فضای کار", "Sign in")}
                <ArrowLeft size={18} />
              </Button>
            </form>
            {demo && (
              <>
                <div className="login-or">
                  <span />
                  {t("اول یک نگاه بیندازید", "Or take a look around")}
                  <span />
                </div>
                <Button
                  onClick={() => login(true)}
                  loading={busy}
                  icon={ArrowUpRight}
                >
                  {t("دیدن فضای آزمایشی", "Explore the demo")}
                </Button>
              </>
            )}
            <div className="login-trust">
              <ShieldCheck size={18} />
              <span>
                <strong>
                  {t(
                    "فضای کاری که به آن اعتماد می‌کنید.",
                    "A workspace you can rely on.",
                  )}
                </strong>
                <small>
                  {t(
                    "دسترسی بر اساس نقش. اطلاعات در یک جای امن.",
                    "Role-based access. Everything in one secure place.",
                  )}
                </small>
              </span>
            </div>
          </div>
          <div className="login-form-footer">
            <span>© {new Date().getFullYear()} Faracode</span>
            <span>{t("ساخته‌شده برای میدان.", "Made for the field.")}</span>
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkspaceSkeleton() {
  return (
    <div
      className="loading-workspace"
      aria-label="در حال بارگذاری / Loading workspace"
    >
      <aside>
        <BrandMark />
        <strong>فراکد</strong>
        {Array.from({ length: 8 }, (_, i) => (
          <span className="skeleton" key={i} />
        ))}
      </aside>
      <main>
        <div className="loading-top skeleton" />
        <div className="loading-heading">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
        <div className="stats-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="stat-card skeleton" key={i} />
          ))}
        </div>
        <div className="loading-panels">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
        <span className="loading-label">
          <LoaderCircle className="spin" size={17} />
          در حال آماده‌سازی یک روز خوب…
        </span>
      </main>
    </div>
  );
}
