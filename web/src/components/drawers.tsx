"use client";
import { useState } from "react";
import {
  Camera,
  Check,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Flag,
  History,
  Info,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Plus,
  Route,
  ShieldCheck,
  Square,
  Users,
} from "lucide-react";
import { useWorkspace } from "./context";
import { errorText } from "@/lib/api";
import {
  Arrow,
  Avatar,
  Badge,
  Button,
  CheckItem,
  Dialog,
  Empty,
  Progress,
} from "./ui";
import { EvidenceGallery } from "./dialogs";
import { CampaignHistory, CampaignMessages } from "./campaign-records";
import { mapLocationUrl } from "./iran-map";
import {
  ShiftSummaryPanel,
  ShiftTrackingHistory,
  ShiftWorkHours,
} from "./shift-operations";

export function ShiftDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, t, n, date, time, open, planner, reviewer, mutate, notify } =
    useWorkspace();
  const [tab, setTab] = useState("workspace");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const shift = data.shifts.find((s) => s.id === id);
  if (!shift)
    return (
      <Dialog title={t("شیفت پیدا نشد", "Shift not found")} onClose={onClose}>
        <Empty
          title={t("این شیفت در دسترس نیست", "This shift is not available")}
        />
      </Dialog>
    );
  const mine =
    shift.team.some((p) => p.id === data.user.id) ||
    (data.user.role === "supervisor" && shift.supervisor_id === data.user.id);
  const attendance = data.attendance.find(
    (a) => a.shift_id === id && a.person_id === data.user.id,
  );
  const report = data.reports.find((r) => r.shift_id === id);
  const admin = data.user.role === "admin";
  const leader =
    data.user.role === "supervisor" && shift.supervisor_id === data.user.id;
  const now = Date.parse(data.server_time);
  const ended = !!shift.ended_at || shift.status === "completed";
  const scheduledEnd = now >= Date.parse(shift.ends_at);
  const locked =
    shift.status === "completed" ||
    report?.status === "pending" ||
    report?.status === "approved";
  async function geoAction(action: "check-in" | "check-out") {
    setBusy(action);
    setError("");
    try {
      if (!navigator.geolocation)
        throw new Error(
          t(
            "مرورگر از موقعیت مکانی پشتیبانی نمی‌کند",
            "This browser does not support geolocation",
          ),
        );
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          }),
      );
      await mutate(`/shifts/${id}/${action}`, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      notify(
        action === "check-in"
          ? t("ورود شما با موفقیت ثبت شد", "You are checked in")
          : t("خروج شما با موفقیت ثبت شد", "You are checked out"),
      );
    } catch (e) {
      setError(
        typeof e === "object" && e !== null && "code" in e
          ? t(
              "دسترسی GPS را فعال کنید و دوباره تلاش کنید. برای حضور باید در نقطه اجرا باشید.",
              "Allow GPS access and try again. You need to be at the activation point.",
            )
          : errorText(e),
      );
    } finally {
      setBusy("");
    }
  }
  async function readiness() {
    setBusy("ready");
    setError("");
    try {
      await mutate(`/shifts/${id}/readiness`, {});
      notify(t("آمادگی نقطه تأیید شد", "Location readiness confirmed"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Dialog
      title={shift.location_name}
      description={shift.campaign_name}
      drawer
      onClose={onClose}
    >
      <div className="shift-drawer-hero">
        <span className={`brand-label ${shift.color}`}>{shift.brand_name}</span>
        <Badge value={ended ? "completed" : shift.status} />
        <div className="drawer-location">
          <MapPin size={17} />
          <span>
            {shift.city} · {shift.address}
          </span>
        </div>
        <div className="drawer-time">
          <CalendarIcon />
          {date(shift.starts_at, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          <span>·</span>
          <Clock3 size={15} />
          {time(shift.starts_at)} – {time(shift.ends_at)}
        </div>
      </div>
      <ShiftWorkHours shift={shift} />
      {!ended && (
        <div className="shift-schedule-actions">
          {admin && !locked && !scheduledEnd && (
            <Button
              icon={Clock3}
              onClick={() => open({ kind: "shift-schedule", id })}
            >
              {t("ویرایش برنامه و تیم", "Edit schedule and team")}
            </Button>
          )}
          {(admin || leader) && now >= Date.parse(shift.starts_at) && (
            <Button
              icon={Square}
              onClick={() => open({ kind: "shift-end", id })}
            >
              {t("پایان شیفت", "End shift")}
            </Button>
          )}
        </div>
      )}
      <div className="drawer-tabs">
        <button
          className={tab === "workspace" ? "active" : ""}
          onClick={() => setTab("workspace")}
        >
          {t("فضای شیفت", "Workspace")}
        </button>
        <button
          className={tab === "evidence" ? "active" : ""}
          onClick={() => setTab("evidence")}
        >
          {t("شواهد و گزارش", "Evidence & report")}
          <span>
            {n(data.evidence.filter((e) => e.shift_id === id).length)}
          </span>
        </button>
        <button
          className={tab === "team" ? "active" : ""}
          onClick={() => setTab("team")}
        >
          {t("تیم و حضور", "Team & attendance")}
        </button>
        {admin && (
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            <Route size={14} /> {t("تاریخچه موقعیت", "Location history")}
          </button>
        )}
      </div>
      {tab === "history" && admin && <ShiftTrackingHistory shift={shift} />}
      {tab === "workspace" && (
        <>
          <div className="shift-detail-metrics">
            <div>
              <Package size={17} />
              <span>{t("توزیع‌شده", "Distributed")}</span>
              <strong>{n(shift.distributed)}</strong>
            </div>
            <div>
              <Flag size={17} />
              <span>{t("هدف شیفت", "Shift target")}</span>
              <strong>{n(shift.target)}</strong>
            </div>
            <div>
              <ShieldCheck size={17} />
              <span>{t("موجودی فعلی", "Stock balance")}</span>
              <strong>{n(shift.remaining)}</strong>
            </div>
          </div>
          <Progress value={(shift.distributed / shift.target) * 100} />
          <section className="detail-section">
            <h3>{t("قدم‌های این شیفت", "Your shift, step by step")}</h3>
            <div className="shift-checklist">
              <CheckItem done={shift.team.length >= shift.required_staff}>
                {t("تیم اجرا تکمیل شده", "Field team assigned")}
              </CheckItem>
              <CheckItem done={shift.ready}>
                {t(
                  "آمادگی محصول و تجهیزات تأیید شده",
                  "Products and equipment ready",
                )}
              </CheckItem>
              <CheckItem done={data.attendance.some((a) => a.shift_id === id)}>
                {t("حضور تیم ثبت شده", "Team attendance recorded")}
              </CheckItem>
              <CheckItem done={data.evidence.some((e) => e.shift_id === id)}>
                {t("تصاویر اجرا بارگذاری شده", "Evidence photos uploaded")}
              </CheckItem>
              <CheckItem done={!!report}>
                {t(
                  "گزارش پایان شیفت ارسال شده",
                  "End-of-shift report submitted",
                )}
              </CheckItem>
            </div>
          </section>
          {mine &&
            !ended &&
            (!scheduledEnd || !!attendance) &&
            (!locked || !!attendance) && (
              <div className="attendance-action">
                {!attendance ? (
                  <Button
                    variant="primary"
                    icon={LogIn}
                    loading={busy === "check-in"}
                    onClick={() => geoAction("check-in")}
                  >
                    {t("ثبت ورود با موقعیت", "Check in with GPS")}
                  </Button>
                ) : !attendance.checked_out_at ? (
                  <Button
                    variant="primary"
                    icon={LogOut}
                    loading={busy === "check-out"}
                    onClick={() => geoAction("check-out")}
                  >
                    {t("ثبت خروج با موقعیت", "Check out with GPS")}
                  </Button>
                ) : (
                  <span className="attended-note">
                    <CheckCircleIcon />
                    {t(
                      "ورود و خروج شما ثبت شده است.",
                      "Your check-in and check-out are complete.",
                    )}
                  </span>
                )}
                <small>
                  <LocateFixed size={14} />
                  {t("حضور در شعاع", "Within")} {n(shift.radius)}{" "}
                  {t(
                    "متر · دقت GPS حداکثر ۱۵۰ متر",
                    "m · GPS accuracy ≤ 150 m",
                  )}
                </small>
              </div>
            )}
          {error && (
            <div className="form-error" role="alert">
              <Info size={17} />
              {error}
            </div>
          )}
          <div className="quick-action-grid">
            {reviewer && !shift.ready && !locked && (
              <Button
                icon={Check}
                loading={busy === "ready"}
                onClick={readiness}
              >
                {t("تأیید آمادگی نقطه", "Confirm readiness")}
              </Button>
            )}
            <Button
              icon={Package}
              disabled={locked}
              onClick={() => open({ kind: "stock", id })}
            >
              {t("ثبت توزیع / موجودی", "Record distribution / stock")}
            </Button>
            <Button
              icon={Camera}
              disabled={shift.status === "completed"}
              onClick={() => open({ kind: "evidence", id })}
            >
              {t("بارگذاری تصویر", "Upload a photo")}
            </Button>
            <Button
              icon={Flag}
              disabled={shift.status === "completed"}
              onClick={() => open({ kind: "issue", id })}
            >
              {t("گزارش مشکل", "Report an issue")}
            </Button>
            <Button
              icon={FileText}
              disabled={locked}
              onClick={() => open({ kind: "report", id })}
            >
              {t("گزارش پایان شیفت", "Submit shift report")}
            </Button>
          </div>
          <section className="detail-section">
            <h3>{t("برای یک اجرای هماهنگ", "A few things to keep in mind")}</h3>
            <p className="prose-copy instructions">
              {shift.instructions ||
                t(
                  "دستورالعملی ثبت نشده است.",
                  "No instructions have been added.",
                )}
            </p>
          </section>
          <a
            className="directions-link"
            href={mapLocationUrl(shift.latitude, shift.longitude)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={17} />
            {t("باز کردن محل اجرا روی نقشه", "Open location on map")}
            <Arrow size={16} />
          </a>
          <section className="detail-section">
            <h3>{t("مشکلات این شیفت", "Issues at this shift")}</h3>
            {data.issues.filter((i) => i.shift_id === id).length ? (
              data.issues
                .filter((i) => i.shift_id === id)
                .map((i) => (
                  <button
                    className="related-shift"
                    key={i.id}
                    onClick={() => open({ kind: "issue-detail", id: i.id })}
                  >
                    <span>
                      <strong>{i.title}</strong>
                      <small>{i.owner_name}</small>
                    </span>
                    <Badge value={i.status} />
                  </button>
                ))
            ) : (
              <p className="muted">
                {t(
                  "مشکلی ثبت نشده؛ همه‌چیز رو به راه است.",
                  "No issues reported. Looking good.",
                )}
              </p>
            )}
          </section>
        </>
      )}
      {tab === "evidence" && (
        <>
          {shift.ended_at && <ShiftSummaryPanel shiftId={id} />}
          <EvidenceGallery shiftId={id} />
          {shift.status !== "completed" && (
            <Button
              icon={Camera}
              onClick={() => open({ kind: "evidence", id })}
            >
              {t("افزودن تصویر جدید", "Add a photo")}
            </Button>
          )}
          <section className="detail-section">
            <h3>{t("گزارش پایان شیفت", "End-of-shift report")}</h3>
            {report ? (
              <>
                <Badge value={report.status} />
                <p className="prose-copy report-summary">{report.summary}</p>
                {report.feedback && (
                  <div className="review-feedback">{report.feedback}</div>
                )}
                {report.status === "pending" && reviewer && (
                  <Button
                    icon={FileCheck2}
                    variant="primary"
                    onClick={() => open({ kind: "review", id: report.id })}
                  >
                    {t("بررسی و تأیید گزارش", "Review this report")}
                  </Button>
                )}
                {report.status === "returned" && (
                  <Button
                    icon={FileText}
                    onClick={() => open({ kind: "report", id })}
                  >
                    {t("اصلاح و ارسال مجدد", "Revise and resubmit")}
                  </Button>
                )}
              </>
            ) : (
              <Empty
                title={t("گزارش هنوز ارسال نشده", "No report submitted yet")}
                description={t(
                  "پس از خروج تیم و ثبت تصاویر، خلاصه اجرا را ارسال کنید.",
                  "After check-out and uploading photos, send your shift summary.",
                )}
                action={
                  shift.status !== "completed" && (
                    <Button
                      icon={FileText}
                      onClick={() => open({ kind: "report", id })}
                    >
                      {t("ثبت گزارش", "Write a report")}
                    </Button>
                  )
                }
              />
            )}
          </section>
        </>
      )}
      {tab === "team" && (
        <>
          <div className="section-title-row">
            <h3>
              {t("تیم این شیفت", "Your shift team")}{" "}
              <span>
                {n(shift.team.length)} / {n(shift.required_staff)}
              </span>
            </h3>
            {planner && !locked && !ended && !scheduledEnd && (
              <Button
                icon={Plus}
                disabled={shift.team.length >= shift.required_staff}
                onClick={() => open({ kind: "assign", id })}
              >
                {t("افزودن نیرو", "Assign teammate")}
              </Button>
            )}
          </div>
          {[
            {
              id: shift.supervisor_id,
              name: shift.supervisor_name,
              color: "",
              role: "supervisor",
            },
            ...shift.team.map((p) => ({ ...p, role: "sampler" })),
          ].map((p) => {
            const a = data.attendance.find(
              (a) => a.shift_id === id && a.person_id === p.id,
            );
            return (
              <div className="team-person-row" key={p.id}>
                <Avatar name={p.name} color={p.color} />
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.role === "supervisor"
                      ? t("سرپرست", "Supervisor")
                      : t("سمپلر", "Sampler")}
                    {a
                      ? " · " +
                        time(a.checked_in_at) +
                        (a.checked_out_at ? " – " + time(a.checked_out_at) : "")
                      : ""}
                  </small>
                </div>
                {a ? (
                  a.ended_automatically ? (
                    <span className="role-chip">
                      {t("پایان خودکار", "Auto-closed")}
                    </span>
                  ) : (
                    <Badge value={a.checked_out_at ? "out" : "present"} />
                  )
                ) : (
                  (data.user.role !== "sampler" || p.id === data.user.id) && (
                    <span className="muted">
                      {ended
                        ? t("حضور ثبت نشده", "No check-in")
                        : t("منتظر ورود", "Expected")}
                    </span>
                  )
                )}
              </div>
            );
          })}
          {!shift.team.length && (
            <Empty
              title={t(
                "تیم منتظر همراهان تازه است",
                "Your team is waiting to come together",
              )}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 2v6M17 2v6M3 11h18" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

export function CampaignDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, t, n, date, planner, open, selectShift, mutate, notify } =
    useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"details" | "messages" | "history">(
    "details",
  );
  const campaign = data.campaigns.find((c) => c.id === id);
  if (!campaign) return null;
  const shifts = data.shifts.filter((s) => s.campaign_id === id);
  async function update(value: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(`/campaigns/${id}`, { status: value }, "PATCH");
      notify(t("وضعیت کمپین تغییر کرد", "Campaign status updated"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={campaign.name}
      description={campaign.brand_name + " · " + campaign.product_name}
      drawer
      onClose={onClose}
    >
      <div
        className="campaign-tabs"
        role="group"
        aria-label={t("بخش‌های کمپین", "Campaign sections")}
      >
        <button
          type="button"
          aria-pressed={section === "details"}
          onClick={() => setSection("details")}
        >
          <FileText size={17} />
          {t("جزئیات", "Details")}
        </button>
        <button
          type="button"
          aria-pressed={section === "messages"}
          onClick={() => setSection("messages")}
        >
          <MessageCircle size={17} />
          {t("گفت‌وگو", "Conversation")}
        </button>
        <button
          type="button"
          aria-pressed={section === "history"}
          onClick={() => setSection("history")}
        >
          <History size={17} />
          {t("تاریخچه", "History")}
        </button>
      </div>
      {section === "messages" ? (
        <CampaignMessages key={id} campaign={id} />
      ) : null}
      {section === "history" ? (
        <CampaignHistory key={id} campaign={id} />
      ) : null}
      {section === "details" && (
        <>
          <div className={`campaign-detail-brand ${campaign.color}`}>
            <span>{campaign.brand_name}</span>
            <Badge value={campaign.status} />
            <svg viewBox="0 0 150 150" aria-hidden="true">
              <circle cx="75" cy="75" r="55" />
              <circle cx="75" cy="75" r="38" />
              <circle cx="75" cy="75" r="21" />
              <path d="M75 0v150M0 75h150" />
            </svg>
          </div>
          <div className="campaign-target">
            <span>{t("توزیع نمونه‌ها", "Samples distributed")}</span>
            <strong>
              {n(campaign.distributed)}{" "}
              <small>
                {t("از", "of")} {n(campaign.target)}
              </small>
            </strong>
            <Progress value={(campaign.distributed / campaign.target) * 100} />
            <small>
              {n(Math.round((campaign.distributed / campaign.target) * 100))}٪{" "}
              {t("از هدف کمپین محقق شده", "of the campaign target reached")}
            </small>
          </div>
          <div className="details-grid">
            <div className="info-pair">
              <span>{t("مشتری", "Client")}</span>
              <strong>{campaign.customer_name}</strong>
            </div>
            <div className="info-pair">
              <span>{t("نقاط اجرا", "Locations")}</span>
              <strong>
                {n(campaign.points)} {t("نقطه", "points")}
              </strong>
            </div>
            <div className="info-pair">
              <span>{t("شروع کمپین", "Starts")}</span>
              <strong>{date(campaign.start_date + "T12:00:00")}</strong>
            </div>
            <div className="info-pair">
              <span>{t("پایان کمپین", "Ends")}</span>
              <strong>{date(campaign.end_date + "T12:00:00")}</strong>
            </div>
          </div>
          <section className="detail-section">
            <h3>{t("داستان این کمپین", "The campaign brief")}</h3>
            <p className="prose-copy">
              {campaign.description ||
                t("توضیحی ثبت نشده است.", "No brief added yet.")}
            </p>
          </section>
          {planner && (
            <label className="form-field">
              <span>{t("وضعیت کمپین", "Campaign status")}</span>
              <select
                disabled={busy}
                value={campaign.status}
                onChange={(e) => update(e.target.value)}
              >
                <option value="draft">{t("پیش‌نویس", "Draft")}</option>
                <option value="scheduled">
                  {t("برنامه‌ریزی‌شده", "Scheduled")}
                </option>
                <option value="active">{t("در حال اجرا", "Active")}</option>
                <option value="paused">{t("متوقف‌شده", "Paused")}</option>
                <option value="completed">
                  {t("پایان‌یافته", "Completed")}
                </option>
              </select>
            </label>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <section className="detail-section">
            <div className="section-title-row">
              <h3>{t("شیفت‌های این کمپین", "Campaign shifts")}</h3>
              {planner &&
                !["paused", "completed"].includes(campaign.status) && (
                  <Button
                    icon={Plus}
                    onClick={() => open({ kind: "shift", id })}
                  >
                    {t("شیفت جدید", "New shift")}
                  </Button>
                )}
            </div>
            {shifts.length ? (
              shifts.map((s) => (
                <button
                  className="related-shift"
                  key={s.id}
                  onClick={() => {
                    onClose();
                    selectShift(s.id);
                  }}
                >
                  <span>
                    <strong>{s.location_name}</strong>
                    <small>
                      {s.city} ·{" "}
                      {date(s.starts_at, { day: "numeric", month: "short" })}
                    </small>
                  </span>
                  <Badge value={s.ended_at ? "completed" : s.status} />
                  <Arrow size={15} />
                </button>
              ))
            ) : (
              <Empty
                title={t(
                  "اولین شیفت را برنامه‌ریزی کنید",
                  "Plan your first shift",
                )}
              />
            )}
          </section>
        </>
      )}
    </Dialog>
  );
}
