"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Arrow, Avatar, Badge, Button, CardHeading, Empty, Select } from "./ui";
import { CollectionBar, DataTable, PageHeading } from "./collections";
import { dayKey } from "@/lib/api";
import { GeneratedShiftReports } from "./shift-operations";
import {
  AttendanceInsight,
  StockOverview,
  IssuesBoard,
  ReportCards,
  CatalogCards,
  InsightStrip,
  ViewSwitcher,
} from "./page-panels";

export function AttendanceView() {
  const { data, t, n, date, time, selectShift, open } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [attendanceDay, setAttendanceDay] = useState("all");
  const today = dayKey(data.server_time);
  const rows = data.attendance.filter(
    (a) =>
      (status === "all" ||
        (status === "present" && !a.checked_out_at) ||
        (status === "out" && a.checked_out_at)) &&
      (attendanceDay === "all" || dayKey(a.checked_in_at) === attendanceDay) &&
      [a.person_name, a.location_name, a.campaign_name].some((v) =>
        v.includes(q),
      ),
  );
  return (
    <>
      <PageHeading
        eyebrow="ATTENDANCE"
        title={t("حضور و غیاب", "Attendance")}
        description={t(
          "ثبت ورود و خروج با زمان و موقعیت؛ تصویر واقعی حضور تیم در هر نقطه.",
          "Time and location records give you a clear view of your team.",
        )}
        action={
          <Button
            icon={MapPin}
            onClick={() => open({ kind: "attendance-help" })}
          >
            {t("راهنمای ثبت حضور", "Attendance guide")}
          </Button>
        }
      />
      <div className="mini-stat-grid">
        <MiniStat
          label={t("ورودهای امروز", "Today's check-ins")}
          value={n(
            data.attendance.filter((a) => dayKey(a.checked_in_at) === today)
              .length,
          )}
          icon={Users}
        />
        <MiniStat
          label={t("هم‌اکنون در میدان", "Currently in the field")}
          value={n(
            data.attendance.filter(
              (a) => !a.checked_out_at && dayKey(a.checked_in_at) === today,
            ).length,
          )}
          icon={MapPin}
        />
        <MiniStat
          label={t("خروج‌های ثبت‌شده", "Completed check-outs")}
          value={n(data.attendance.filter((a) => a.checked_out_at).length)}
          icon={CheckCheck}
        />
      </div>
      <AttendanceInsight />
      <article className="card">
        <CollectionBar
          query={q}
          setQuery={setQ}
          count={rows.length}
          placeholder={t(
            "جست‌وجوی همکار یا نقطه…",
            "Search teammates or locations…",
          )}
        >
          <Select
            aria-label={t("روز حضور", "Attendance date")}
            value={attendanceDay}
            onChange={(e) => setAttendanceDay(e.target.value)}
          >
            <option value="all">{t("همه روزها", "All dates")}</option>
            <option value={today}>{t("امروز", "Today")}</option>
            {Array.from(
              new Set(data.attendance.map((a) => dayKey(a.checked_in_at))),
            )
              .filter((d) => d !== today)
              .sort()
              .reverse()
              .map((d) => (
                <option key={d} value={d}>
                  {date(d + "T12:00:00", {
                    year: undefined,
                    day: "numeric",
                    month: "long",
                  })}
                </option>
              ))}
          </Select>
          <Select
            aria-label={t("وضعیت حضور", "Attendance status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{t("همه وضعیت‌ها", "All statuses")}</option>
            <option value="present">{t("حاضر", "Present")}</option>
            <option value="out">{t("خروج ثبت‌شده", "Checked out")}</option>
          </Select>
        </CollectionBar>
        <DataTable
          rows={rows}
          columns={[
            {
              label: t("همکار", "Teammate"),
              render: (a) => (
                <div className="person-cell">
                  <Avatar name={a.person_name} />
                  <strong>{a.person_name}</strong>
                </div>
              ),
            },
            {
              label: t("نقطه / کمپین", "Point / campaign"),
              render: (a) => (
                <button
                  className="cell-link"
                  onClick={() => selectShift(a.shift_id)}
                >
                  {a.location_name}
                  <small>{a.campaign_name}</small>
                </button>
              ),
            },
            {
              label: t("ورود", "Check-in"),
              render: (a) => (
                <span>
                  {time(a.checked_in_at)}
                  <small className="block-muted">
                    {date(a.checked_in_at, { day: "numeric", month: "short" })}
                  </small>
                </span>
              ),
            },
            {
              label: t("خروج", "Check-out"),
              render: (a) => (a.checked_out_at ? time(a.checked_out_at) : "—"),
            },
            {
              label: t("دقت موقعیت", "GPS accuracy"),
              render: (a) => (
                <span className="cell-icon">
                  <ShieldCheck size={15} />
                  {n(Math.round(a.in_accuracy))} {t("متر", "m")}
                </span>
              ),
            },
            {
              label: t("وضعیت", "Status"),
              render: (a) => (
                <Badge
                  value={
                    a.ended_automatically
                      ? "auto_out"
                      : a.checked_out_at
                        ? "out"
                        : "present"
                  }
                />
              ),
            },
          ]}
        />
      </article>
    </>
  );
}
export function StockLabel({ kind }: { kind: string }) {
  const { t } = useWorkspace();
  const names: Record<string, [string, string]> = {
    initial: ["موجودی اولیه", "Initial stock"],
    added: ["افزایش موجودی", "Replenishment"],
    distributed: ["توزیع‌شده", "Distributed"],
    damaged: ["آسیب‌دیده", "Damaged"],
    returned: ["برگشتی", "Returned"],
  };
  return <>{t(...(names[kind] || [kind, kind]))}</>;
}
export function InventoryView() {
  const { data, t, n, date, open, selectShift } = useWorkspace();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [tab, setTab] = useState("balances");
  const active = data.shifts.filter((s) => s.status !== "completed");
  const shifts = active.filter((s) =>
    [s.location_name, s.campaign_name, s.city].some((v) => v.includes(q)),
  );
  const stock = data.stock.filter(
    (s) =>
      (kind === "all" || s.kind === kind) &&
      [s.location_name, s.campaign_name, s.person_name].some((v) =>
        v.includes(q),
      ),
  );
  return (
    <>
      <PageHeading
        eyebrow="INVENTORY"
        title={t("موجودی و توزیع", "Stock & distribution")}
        description={t(
          "از تحویل اولیه تا آخرین برگشتی؛ گردش محصول را دقیق دنبال کنید.",
          "From the first delivery to the final return, keep every unit in view.",
        )}
        action={
          <Button
            icon={Plus}
            variant="primary"
            onClick={() => open({ kind: "stock" })}
          >
            {t("ثبت گردش موجودی", "Record stock movement")}
          </Button>
        }
      />
      <div className="mini-stat-grid">
        <MiniStat
          label={t("موجودی قابل‌استفاده", "Available stock")}
          value={n(active.reduce((s, v) => s + v.remaining, 0))}
          icon={Package}
        />
        <MiniStat
          label={t("توزیع در شیفت‌های فعال", "Distributed in active shifts")}
          value={n(active.reduce((s, v) => s + v.distributed, 0))}
          icon={PackageCheck}
        />
        <MiniStat
          label={t("آسیب‌دیده و برگشتی", "Damaged & returned")}
          value={n(active.reduce((s, v) => s + v.damaged + v.returned, 0))}
          icon={ArrowDownLeft}
        />
      </div>
      <StockOverview shifts={active} />
      <article className="card">
        <div className="card-tabs">
          <button
            className={tab === "balances" ? "active" : ""}
            onClick={() => setTab("balances")}
          >
            {t("موجودی نقاط", "Point balances")}
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            {t("تاریخچه گردش", "Movement history")}
          </button>
        </div>
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی نقطه یا کمپین…",
            "Search points or campaigns…",
          )}
          count={tab === "balances" ? shifts.length : stock.length}
        >
          {tab === "history" && (
            <Select
              aria-label={t("نوع گردش", "Movement type")}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">{t("همه گردش‌ها", "All movements")}</option>
              {["initial", "added", "distributed", "damaged", "returned"].map(
                (k) => (
                  <option key={k} value={k}>
                    {
                      {
                        initial: t("موجودی اولیه", "Initial"),
                        added: t("افزایش", "Added"),
                        distributed: t("توزیع", "Distributed"),
                        damaged: t("آسیب", "Damaged"),
                        returned: t("برگشتی", "Returned"),
                      }[k]
                    }
                  </option>
                ),
              )}
            </Select>
          )}
        </CollectionBar>
        {tab === "balances" ? (
          <DataTable
            rows={shifts}
            columns={[
              {
                label: t("نقطه / کمپین", "Point / campaign"),
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
              {
                label: t("دریافت‌شده", "Received"),
                render: (s) => n(s.received),
              },
              {
                label: t("توزیع‌شده", "Distributed"),
                render: (s) => (
                  <strong className="teal-text">{n(s.distributed)}</strong>
                ),
              },
              { label: t("آسیب‌دیده", "Damaged"), render: (s) => n(s.damaged) },
              { label: t("برگشتی", "Returned"), render: (s) => n(s.returned) },
              {
                label: t("موجودی", "Balance"),
                render: (s) => (
                  <span
                    className={`stock-balance ${s.remaining < 100 ? "low" : ""}`}
                  >
                    {n(s.remaining)}
                  </span>
                ),
              },
              {
                label: t("ثبت گردش", "Record"),
                render: (s) => (
                  <button
                    className="text-button"
                    onClick={() => open({ kind: "stock", id: s.id })}
                  >
                    <Plus size={15} />
                    {t("ثبت", "Record")}
                  </button>
                ),
              },
            ]}
          />
        ) : (
          <DataTable
            rows={stock}
            columns={[
              {
                label: t("نوع گردش", "Movement"),
                render: (s) => (
                  <span className={`movement-kind ${s.kind}`}>
                    <StockLabel kind={s.kind} />
                  </span>
                ),
              },
              {
                label: t("تعداد", "Quantity"),
                render: (s) => <strong>{n(s.quantity)}</strong>,
              },
              { label: t("نقطه", "Location"), render: (s) => s.location_name },
              {
                label: t("ثبت‌کننده", "Recorded by"),
                render: (s) => s.person_name,
              },
              {
                label: t("زمان", "Time"),
                render: (s) =>
                  date(s.created_at, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
              },
              {
                label: t("توضیح", "Note"),
                render: (s) => <span className="muted">{s.note || "—"}</span>,
              },
            ]}
          />
        )}
      </article>
      <div className="information-note">
        <ShieldCheck size={18} />
        <p>
          {t(
            "موجودی پایان شیفت باید با توزیع، آسیب‌دیده و برگشتی تطبیق داده شود. تأیید گزارش، گردش‌های آن شیفت را نهایی می‌کند.",
            "Reconcile the closing balance with distributions, damaged units, and returns. Approval finalizes the shift's stock ledger.",
          )}
        </p>
      </div>
    </>
  );
}
export function IssuesView() {
  const { data, t, n, date, open, mutate, notify, reviewer } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [layout, setLayout] = useState("board");
  const [priority, setPriority] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const rows = data.issues.filter(
    (i) =>
      (status === "all" ||
        (status === "unresolved" && i.status !== "resolved") ||
        i.status === status) &&
      (priority === "all" || i.priority === priority) &&
      [i.title, i.location_name, i.owner_name].some((v) => v.includes(q)),
  );
  async function update(id: string, value: string) {
    setBusy(id);
    try {
      await mutate(`/issues/${id}`, { status: value }, "PATCH");
      notify(t("وضعیت مشکل به‌روز شد", "Issue status updated"));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Error", true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ISSUES & FOLLOW-UPS"
        title={t("مشکلات و پیگیری‌ها", "Issues & follow-ups")}
        description={t(
          "هر مشکل یک مسئول، یک مسیر روشن و یک فرصت برای بهتر شدن دارد.",
          "Every issue has an owner, a clear next step, and a chance to improve.",
        )}
        action={
          <Button
            icon={Plus}
            variant="primary"
            onClick={() => open({ kind: "issue" })}
          >
            {t("ثبت مشکل", "Report an issue")}
          </Button>
        }
      />
      <div className="mini-stat-grid">
        <MiniStat
          label={t("مسائل باز", "Open issues")}
          action={() => setStatus("open")}
          value={n(data.issues.filter((i) => i.status === "open").length)}
          icon={FileText}
        />
        <MiniStat
          label={t("در حال پیگیری", "In progress")}
          action={() => setStatus("in_progress")}
          value={n(
            data.issues.filter((i) => i.status === "in_progress").length,
          )}
          icon={Clock3}
        />
        <MiniStat
          label={t("حل‌شده", "Resolved")}
          action={() => setStatus("resolved")}
          value={n(data.issues.filter((i) => i.status === "resolved").length)}
          icon={CheckCheck}
        />
      </div>
      <article className="card">
        <CollectionBar
          query={q}
          setQuery={setQ}
          placeholder={t(
            "جست‌وجوی مشکل، نقطه یا مسئول…",
            "Search issues, points, or owners…",
          )}
          count={rows.length}
        >
          <Select
            aria-label={t("وضعیت مشکل", "Issue status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="unresolved">
              {t("موارد باز و در حال پیگیری", "Unresolved")}
            </option>
            <option value="open">{t("باز", "Open")}</option>
            <option value="in_progress">
              {t("در حال پیگیری", "In progress")}
            </option>
            <option value="resolved">{t("حل‌شده", "Resolved")}</option>
            <option value="all">{t("همه وضعیت‌ها", "All statuses")}</option>
          </Select>
          <Select
            aria-label={t("اولویت", "Priority")}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="all">{t("همه اولویت‌ها", "All priorities")}</option>
            <option value="urgent">{t("فوری", "Urgent")}</option>
            <option value="high">{t("زیاد", "High")}</option>
            <option value="medium">{t("متوسط", "Medium")}</option>
            <option value="low">{t("کم", "Low")}</option>
          </Select>
          <ViewSwitcher board value={layout} onChange={setLayout} />
        </CollectionBar>
        {layout === "board" ? (
          <IssuesBoard rows={rows} busy={busy} onUpdate={update} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                label: t("موضوع", "Issue"),
                render: (i) => (
                  <button
                    className="cell-link"
                    onClick={() => open({ kind: "issue-detail", id: i.id })}
                  >
                    {i.title}
                    <small>
                      {i.location_name} · {i.city}
                    </small>
                  </button>
                ),
              },
              {
                label: t("اولویت", "Priority"),
                render: (i) => <Badge value={i.priority} />,
              },
              {
                label: t("مسئول پیگیری", "Owner"),
                render: (i) => (
                  <div className="person-cell">
                    <Avatar name={i.owner_name} size="small" />
                    <span>{i.owner_name}</span>
                  </div>
                ),
              },
              {
                label: t("زمان ثبت", "Reported"),
                render: (i) =>
                  date(i.created_at, { day: "numeric", month: "short" }),
              },
              {
                label: t("وضعیت", "Status"),
                render: (i) =>
                  reviewer ? (
                    <Select
                      aria-label={`${t("وضعیت", "Status")} ${i.title}`}
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
                      value={i.status}
                      onChange={(e) => update(i.id, e.target.value)}
                    >
                      <option value="open">{t("باز", "Open")}</option>
                      <option value="in_progress">
                        {t("در حال پیگیری", "In progress")}
                      </option>
                      <option value="resolved">
                        {t("حل‌شده", "Resolved")}
                      </option>
                    </Select>
                  ) : (
                    <Badge value={i.status} />
                  ),
              },
            ]}
          />
        )}
      </article>
    </>
  );
}
export function ReportsView() {
  const { data, t, n, date, open, selectShift, reviewer } = useWorkspace();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [kind, setKind] = useState<"reviews" | "automatic">("reviews");
  const generated = data.shift_summaries ?? [];
  const generatedRows = generated.filter((r) =>
    [r.campaign_name, r.location_name].some((v) => v.includes(q)),
  );
  const rows = data.reports.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      [r.campaign_name, r.location_name, r.submitted_name].some((v) =>
        v.includes(q),
      ),
  );
  return (
    <>
      <PageHeading
        eyebrow="REPORTS & APPROVALS"
        title={t("گزارش‌ها و تأییدها", "Reports & reviews")}
        description={t(
          "شواهد را ببینید، موجودی را تطبیق دهید و اجرای خوب را تأیید کنید.",
          "Review the evidence, reconcile the stock, and sign off on a good day.",
        )}
        action={
          reviewer && (
            <Button
              icon={ArrowDownToLine}
              variant="primary"
              onClick={() => open({ kind: "export" })}
            >
              {t("خروجی گزارش‌ها", "Export reports")}
            </Button>
          )
        }
      />
      <div
        className="report-kind-switch"
        role="group"
        aria-label={t("نوع گزارش", "Report type")}
      >
        <button
          type="button"
          aria-pressed={kind === "reviews"}
          onClick={() => setKind("reviews")}
        >
          <ClipboardCheck size={18} /> {t("گزارش‌های بررسی", "Review reports")}
        </button>
        <button
          type="button"
          aria-pressed={kind === "automatic"}
          onClick={() => setKind("automatic")}
        >
          <FileCheck2 size={18} />{" "}
          {t("خلاصه‌های خودکار", "Automatic summaries")}{" "}
          <span>{n(generated.length)}</span>
        </button>
      </div>
      {kind === "automatic" ? (
        <article className="card">
          <CollectionBar
            query={q}
            setQuery={setQ}
            count={generatedRows.length}
            placeholder={t(
              "جست‌وجوی کمپین یا نقطه…",
              "Search campaigns or locations…",
            )}
          />
          <GeneratedShiftReports rows={generatedRows} />
        </article>
      ) : (
        <>
          <div className="mini-stat-grid">
            <MiniStat
              label={t("در انتظار بررسی", "Pending review")}
              action={() => setStatus("pending")}
              value={n(
                data.reports.filter((r) => r.status === "pending").length,
              )}
              icon={Clock3}
            />
            <MiniStat
              label={t("تأییدشده", "Approved")}
              action={() => setStatus("approved")}
              value={n(
                data.reports.filter((r) => r.status === "approved").length,
              )}
              icon={ShieldCheck}
            />
            <MiniStat
              label={t("برگشت برای اصلاح", "Returned")}
              action={() => setStatus("returned")}
              value={n(
                data.reports.filter((r) => r.status === "returned").length,
              )}
              icon={FileText}
            />
          </div>
          <article className="card">
            <CollectionBar
              query={q}
              setQuery={setQ}
              count={rows.length}
              placeholder={t(
                "جست‌وجوی گزارش، کمپین یا نقطه…",
                "Search reports, campaigns, or locations…",
              )}
            >
              <Select
                aria-label={t("وضعیت گزارش", "Report status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{t("همه گزارش‌ها", "All reports")}</option>
                <option value="pending">
                  {t("در انتظار بررسی", "Pending review")}
                </option>
                <option value="approved">{t("تأییدشده", "Approved")}</option>
                <option value="returned">
                  {t("برگشت برای اصلاح", "Returned")}
                </option>
              </Select>
              <ViewSwitcher value={layout} onChange={setLayout} />
            </CollectionBar>
            {layout === "grid" ? (
              <ReportCards rows={rows} />
            ) : (
              <DataTable
                rows={rows}
                columns={[
                  {
                    label: t("گزارش شیفت", "Shift report"),
                    render: (r) => (
                      <button
                        className="cell-link"
                        onClick={() =>
                          open({ kind: "report-detail", id: r.id })
                        }
                      >
                        {r.location_name}
                        <small>{r.campaign_name}</small>
                      </button>
                    ),
                  },
                  {
                    label: t("ثبت‌کننده", "Submitted by"),
                    render: (r) => (
                      <div className="person-cell">
                        <Avatar name={r.submitted_name} size="small" />
                        {r.submitted_name}
                      </div>
                    ),
                  },
                  {
                    label: t("تاریخ ارسال", "Submitted"),
                    render: (r) =>
                      date(r.submitted_at, { day: "numeric", month: "short" }),
                  },
                  {
                    label: t("شواهد", "Evidence"),
                    render: (r) =>
                      n(
                        data.evidence.filter((e) => e.shift_id === r.shift_id)
                          .length,
                      ) +
                      " " +
                      t("تصویر", "photos"),
                  },
                  {
                    label: t("وضعیت", "Status"),
                    render: (r) => <Badge value={r.status} />,
                  },
                  {
                    label: t("بررسی", "Review"),
                    render: (r) =>
                      r.status === "pending" && reviewer ? (
                        <button
                          className="button review-button"
                          onClick={() => open({ kind: "review", id: r.id })}
                        >
                          {t("بررسی گزارش", "Review report")}
                          <Arrow size={14} />
                        </button>
                      ) : (
                        <button
                          className="text-button"
                          onClick={() =>
                            open({ kind: "report-detail", id: r.id })
                          }
                        >
                          {t("مشاهده", "View")}
                          <Arrow size={14} />
                        </button>
                      ),
                  },
                ]}
              />
            )}
          </article>
        </>
      )}
    </>
  );
}
export function CatalogView() {
  const { data, t, n, open, planner } = useWorkspace();
  const [tab, setTab] = useState("brand");
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState("grid");
  const rows = (
    tab === "customer"
      ? data.customers
      : tab === "brand"
        ? data.brands
        : data.products
  ).filter((v) => v.name.includes(q));
  return (
    <>
      <PageHeading
        eyebrow="BRANDS & PRODUCTS"
        title={t("برندها و محصولات", "Brands & products")}
        description={t(
          "مشتریان، برندها و محصولاتی که تجربه‌های خوب با آن‌ها شروع می‌شود.",
          "The clients, brands, and products behind every good experience.",
        )}
        action={
          planner && (
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => open({ kind: "catalog", subtype: tab })}
            >
              {t("افزودن مورد جدید", "Add new item")}
            </Button>
          )
        }
      />
      <InsightStrip
        items={[
          {
            label: t("مشتریان", "Clients"),
            value: n(data.customers.length),
            icon: Users,
            action: () => setTab("customer"),
          },
          {
            label: t("برندها", "Brands"),
            value: n(data.brands.length),
            icon: ShieldCheck,
            action: () => setTab("brand"),
          },
          {
            label: t("محصولات", "Products"),
            value: n(data.products.length),
            icon: Package,
            action: () => setTab("product"),
          },
        ]}
      />
      <article className="card">
        <div className="card-tabs">
          {[
            ["brand", t("برندها", "Brands")],
            ["product", t("محصولات", "Products")],
            ["customer", t("مشتریان", "Clients")],
          ].map(([v, label]) => (
            <button
              key={v}
              className={tab === v ? "active" : ""}
              onClick={() => setTab(v)}
            >
              {label}
              <span>
                {n(
                  v === "brand"
                    ? data.brands.length
                    : v === "product"
                      ? data.products.length
                      : data.customers.length,
                )}
              </span>
            </button>
          ))}
        </div>
        <CollectionBar query={q} setQuery={setQ} count={rows.length}>
          <ViewSwitcher value={layout} onChange={setLayout} />
        </CollectionBar>
        {layout === "grid" ? (
          <CatalogCards kind={tab} query={q} />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                label: t("نام", "Name"),
                render: (r) => (
                  <div className="person-cell">
                    <span
                      className={`brand-tile ${"color" in r ? r.color : "teal"}`}
                    >
                      {r.name.slice(0, 1)}
                    </span>
                    <strong>{r.name}</strong>
                  </div>
                ),
              },
              {
                label:
                  tab === "brand"
                    ? t("مشتری", "Client")
                    : tab === "product"
                      ? t("برند", "Brand")
                      : t("برندهای مرتبط", "Brands"),
                render: (r) =>
                  "customer_id" in r
                    ? data.customers.find((c) => c.id === r.customer_id)
                        ?.name || "—"
                    : "brand_id" in r
                      ? data.brands.find((b) => b.id === r.brand_id)?.name ||
                        "—"
                      : data.brands
                          .filter((b) => b.customer_id === r.id)
                          .map((b) => b.name)
                          .join("، ") || "—",
              },
              {
                label:
                  tab === "product"
                    ? t("واحد توزیع", "Unit")
                    : t("محصولات مرتبط", "Products"),
                render: (r) =>
                  "unit" in r
                    ? String(r.unit)
                    : data.products
                        .filter((p) =>
                          tab === "brand"
                            ? p.brand_id === r.id
                            : data.brands.some(
                                (b) =>
                                  b.customer_id === r.id && b.id === p.brand_id,
                              ),
                        )
                        .map((p) => p.name)
                        .join("، ") || "—",
              },
            ]}
          />
        )}
      </article>
    </>
  );
}
function MiniStat({
  label,
  value,
  icon: Icon,
  action,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number }>;
  action?: () => void;
}) {
  const content = (
    <>
      <span className="mini-stat-icon">
        <Icon size={22} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {action && <Arrow size={16} />}
    </>
  );
  return action ? (
    <button
      type="button"
      onClick={action}
      className="card mini-stat actionable"
    >
      {content}
    </button>
  ) : (
    <article className="card mini-stat">{content}</article>
  );
}
