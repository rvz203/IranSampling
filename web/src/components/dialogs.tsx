"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe2,
  Info,
  KeyRound,
  LocateFixed,
  MapPin,
  Package,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useWorkspace } from "./context";
import { api, dayKey, errorText, tehranDateTimeToISO } from "@/lib/api";
import type { DialogState, Locale } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  CheckItem,
  Dialog,
  Empty,
  RoleLabel,
} from "./ui";

type Values = Record<string, string>;
type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  default?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  ltr?: boolean;
  step?: string;
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
};
export function SubmitForm({
  fields,
  action,
  label,
  success,
  children,
  onValues,
}: {
  fields: Field[];
  action: (v: Values) => Promise<unknown>;
  label?: string;
  success?: string;
  children?: ReactNode;
  onValues?: (v: Values) => Field[];
}) {
  const { t, close, notify } = useWorkspace();
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        String(f.default ?? f.options?.[0]?.value ?? ""),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actual = onValues ? onValues(values) : fields;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action(values);
      notify(success || t("با موفقیت ذخیره شد", "Saved successfully"));
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="standard-form">
      <div className="form-grid">
        {actual.map((f) => (
          <label key={f.name} className={`form-field ${f.wide ? "full" : ""}`}>
            <span>
              {f.label}
              {f.required !== false && <b className="required-dot">*</b>}
            </span>
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                value={values[f.name] || ""}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
                required={f.required !== false}
                placeholder={f.placeholder}
                rows={4}
                maxLength={f.max || 5000}
                minLength={f.minLength}
              />
            ) : f.options ? (
              <select
                name={f.name}
                value={values[f.name] || ""}
                required={f.required !== false}
                onChange={(e) => {
                  const next = { ...values, [f.name]: e.target.value };
                  if (f.name === "brand_id") {
                    next.product_id = "";
                  }
                  setValues(next);
                }}
              >
                <option value="" disabled>
                  {t("انتخاب کنید…", "Select…")}
                </option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                dir={
                  f.ltr ||
                  [
                    "email",
                    "password",
                    "number",
                    "tel",
                    "date",
                    "datetime-local",
                  ].includes(f.type || "")
                    ? "ltr"
                    : undefined
                }
                value={values[f.name] || ""}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
                required={f.required !== false}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                minLength={f.minLength}
                maxLength={
                  f.maxLength ?? (f.type === "password" ? 72 : undefined)
                }
                pattern={f.pattern}
                autoComplete={
                  f.type === "password" ? "new-password" : undefined
                }
              />
            )}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      {children}
      {error && (
        <div className="form-error" role="alert">
          <Info size={17} />
          {error}
        </div>
      )}
      <div className="form-footer">
        <Button type="button" onClick={close} disabled={busy}>
          {t("انصراف", "Cancel")}
        </Button>
        <Button variant="primary" type="submit" loading={busy} icon={Check}>
          {label || t("ذخیره تغییرات", "Save changes")}
        </Button>
      </div>
    </form>
  );
}
function InfoPair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-pair">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
function ReportContent({ id }: { id: string }) {
  const { data, t, n, date, open, reviewer } = useWorkspace();
  const r = data.reports.find((v) => v.id === id);
  if (!r) return <Empty title={t("گزارش پیدا نشد", "Report not found")} />;
  const shift = data.shifts.find((s) => s.id === r.shift_id);
  return (
    <>
      <div className="detail-banner">
        <FileText size={28} />
        <div>
          <h3>{r.location_name}</h3>
          <p>{r.campaign_name}</p>
        </div>
        <Badge value={r.status} />
      </div>
      <div className="details-grid">
        <InfoPair label={t("ثبت‌کننده", "Submitted by")}>
          {r.submitted_name}
        </InfoPair>
        <InfoPair label={t("تاریخ ارسال", "Submitted")}>
          {date(r.submitted_at)}
        </InfoPair>
        <InfoPair label={t("توزیع نمونه", "Distributed")}>
          {n(shift?.distributed || 0)}
        </InfoPair>
        <InfoPair label={t("موجودی پایان", "Closing balance")}>
          {n(shift?.remaining || 0)}
        </InfoPair>
      </div>
      <section className="detail-section">
        <h3>{t("خلاصه اجرا", "Shift summary")}</h3>
        <p className="prose-copy">{r.summary}</p>
      </section>
      {r.feedback && (
        <div className="review-feedback">
          <strong>{t("بازخورد سرپرست", "Supervisor feedback")}</strong>
          <p>{r.feedback}</p>
        </div>
      )}
      <EvidenceGallery shiftId={r.shift_id} />
    </>
  );
}
export function EvidenceGallery({ shiftId }: { shiftId: string }) {
  const { data, t, date } = useWorkspace();
  const photos = data.evidence.filter((e) => e.shift_id === shiftId);
  return (
    <section className="detail-section">
      <h3>{t("تصاویر اجرا", "Field evidence")}</h3>
      {photos.length ? (
        <div className="evidence-grid">
          {photos.map((e) => (
            <a
              key={e.id}
              href={`/api/evidence/${e.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`/api/evidence/${e.id}`}
                width={240}
                height={180}
                alt={
                  e.caption ||
                  t("تصویر مستند اجرای شیفت", "Shift evidence photo")
                }
                loading="lazy"
              />
              <span>{e.caption || e.original_name}</span>
              <small>
                {e.person_name} ·{" "}
                {date(e.created_at, { day: "numeric", month: "short" })}
              </small>
            </a>
          ))}
        </div>
      ) : (
        <div className="evidence-empty">
          <Camera size={23} />
          <span>
            {t(
              "تصویری برای این شیفت ثبت نشده است.",
              "No photos have been uploaded for this shift.",
            )}
          </span>
        </div>
      )}
    </section>
  );
}

export default function AppDialog({
  state,
  locale,
  setLocale,
  onSignOut,
}: {
  state: NonNullable<DialogState>;
  locale: Locale;
  setLocale: (v: Locale) => void;
  onSignOut: () => void;
}) {
  const {
    data,
    t,
    n,
    date,
    time,
    planner,
    reviewer,
    open,
    close,
    mutate,
    refresh,
    notify,
    selectShift,
  } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [exportDays, setExportDays] = useState("30");
  const [exportCity, setExportCity] = useState("");
  const activeShifts = data.shifts.filter((s) => s.status !== "completed");
  const shiftOptions = activeShifts.map((s) => ({
    value: s.id,
    label: `${s.location_name} · ${s.campaign_name}`,
  }));
  const shiftField: Field = {
    name: "shift_id",
    label: t("شیفت اجرا", "Shift"),
    options: shiftOptions,
    default: state.id || shiftOptions[0]?.value,
    wide: true,
  };
  const today = dayKey(data.server_time);
  const end = dayKey(
    new Date(new Date(data.server_time).getTime() + 14 * 86400000),
  );
  const submit = (path: string, body: unknown, method = "POST") =>
    mutate(path, body, method);
  let title = "",
    description = "",
    content: ReactNode = null;
  let wide = false;
  switch (state.kind) {
    case "campaign": {
      title = t("یک تجربه تازه بسازیم", "Let's make a new experience");
      description = t(
        "اطلاعات کمپین را وارد کنید؛ اجرا از همین‌جا شروع می‌شود.",
        "Set up the details. Your next activation starts here.",
      );
      const fields: Field[] = [
        {
          name: "name",
          label: t("نام کمپین", "Campaign name"),
          placeholder: t(
            "مثلاً: طعم یک شروع تازه",
            "e.g. A taste of something new",
          ),
          wide: true,
          minLength: 3,
        },
        {
          name: "brand_id",
          label: t("برند", "Brand"),
          options: data.brands.map((b) => ({ value: b.id, label: b.name })),
        },
        {
          name: "product_id",
          label: t("محصول", "Product"),
          options: data.products
            .filter((p) => p.brand_id === data.brands[0]?.id)
            .map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "start_date",
          label: t("تاریخ شروع", "Start date"),
          type: "date",
          default: today,
        },
        {
          name: "end_date",
          label: t("تاریخ پایان", "End date"),
          type: "date",
          default: end,
        },
        {
          name: "target",
          label: t("هدف توزیع نمونه", "Sample target"),
          type: "number",
          min: 1,
          max: 100000000,
          placeholder: "10000",
        },
        {
          name: "status",
          label: t("وضعیت شروع", "Starting status"),
          options: [
            { value: "scheduled", label: t("برنامه‌ریزی‌شده", "Scheduled") },
            { value: "draft", label: t("پیش‌نویس", "Draft") },
            { value: "active", label: t("در حال اجرا", "Active") },
          ],
        },
        {
          name: "description",
          label: t("داستان و دستورالعمل کمپین", "Campaign brief"),
          type: "textarea",
          required: false,
          wide: true,
          placeholder: t(
            "هدف کمپین و نکاتی که تیم باید بداند…",
            "The goal, the message, and what your team should know…",
          ),
        },
      ];
      content = (
        <SubmitForm
          fields={fields}
          onValues={(v) =>
            fields.map((f) =>
              f.name === "product_id"
                ? {
                    ...f,
                    options: data.products
                      .filter((p) => p.brand_id === v.brand_id)
                      .map((p) => ({ value: p.id, label: p.name })),
                  }
                : f,
            )
          }
          action={(v) =>
            submit("/campaigns", { ...v, target: Number(v.target) })
          }
          label={t("ساخت کمپین", "Create campaign")}
        />
      );
      break;
    }
    case "shift": {
      title = t("برای یک اجرای خوب برنامه بچینیم", "Plan a great activation");
      description = t(
        "نقطه، زمان و سرپرست را مشخص کنید؛ سپس تیم را اضافه کنید.",
        "Choose the place, time, and supervisor, then bring in your team.",
      );
      const fields: Field[] = [
        {
          name: "campaign_id",
          label: t("کمپین", "Campaign"),
          options: data.campaigns
            .filter((c) => !["completed", "paused"].includes(c.status))
            .map((c) => ({ value: c.id, label: c.name })),
          default: state.id,
          wide: true,
        },
        {
          name: "location_id",
          label: t("نقطه اجرا", "Location"),
          options: data.locations.map((l) => ({
            value: l.id,
            label: l.name + " · " + l.city,
          })),
        },
        {
          name: "supervisor_id",
          label: t("سرپرست", "Supervisor"),
          options: data.people
            .filter((p) => p.role === "supervisor" && p.active !== false)
            .map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "starts_at",
          label: t("شروع شیفت", "Starts at"),
          type: "datetime-local",
          default: today + "T09:00",
          hint: t("به وقت تهران", "Tehran time"),
        },
        {
          name: "ends_at",
          label: t("پایان شیفت", "Ends at"),
          type: "datetime-local",
          default: today + "T18:00",
          hint: t("به وقت تهران", "Tehran time"),
        },
        {
          name: "target",
          label: t("هدف توزیع", "Distribution target"),
          type: "number",
          min: 1,
          max: 100000000,
          default: 1000,
        },
        {
          name: "required_staff",
          label: t("تعداد نیروی موردنیاز", "People needed"),
          type: "number",
          min: 1,
          max: 100,
          default: 2,
        },
        {
          name: "instructions",
          label: t("دستورالعمل تیم", "Team instructions"),
          type: "textarea",
          wide: true,
          required: false,
        },
      ];
      content = (
        <SubmitForm
          fields={fields}
          action={(v) =>
            submit("/shifts", {
              ...v,
              starts_at: tehranDateTimeToISO(v.starts_at),
              ends_at: tehranDateTimeToISO(v.ends_at),
              target: Number(v.target),
              required_staff: Number(v.required_staff),
            })
          }
          label={t("ایجاد شیفت", "Create shift")}
        />
      );
      break;
    }
    case "location":
      title = t("یک نقطه جدید روی نقشه", "A new point on the map");
      description = t(
        "مختصات دقیق، ثبت حضور قابل‌اعتمادتر می‌سازد.",
        "Accurate coordinates make attendance records more reliable.",
      );
      content = (
        <SubmitForm
          fields={[
            {
              name: "name",
              label: t("نام نقطه", "Location name"),
              minLength: 2,
            },
            { name: "city", label: t("شهر", "City"), default: "تهران" },
            {
              name: "address",
              label: t("نشانی", "Address"),
              wide: true,
              required: false,
            },
            {
              name: "latitude",
              label: t("عرض جغرافیایی", "Latitude"),
              type: "number",
              step: "any",
              min: -90,
              max: 90,
              placeholder: "35.7902",
            },
            {
              name: "longitude",
              label: t("طول جغرافیایی", "Longitude"),
              type: "number",
              step: "any",
              min: -180,
              max: 180,
              placeholder: "51.4105",
            },
            {
              name: "radius",
              label: t("شعاع مجاز حضور (متر)", "Attendance radius (metres)"),
              type: "number",
              default: 500,
              min: 50,
              max: 5000,
              wide: true,
              hint: t(
                "برای ثبت حضور، نیرو باید در این محدوده باشد؛ دقت GPS حداکثر ۱۵۰ متر است.",
                "Staff must be within this radius with GPS accuracy of 150 m or better.",
              ),
            },
          ]}
          action={(v) =>
            submit("/locations", {
              ...v,
              latitude: Number(v.latitude),
              longitude: Number(v.longitude),
              radius: Number(v.radius),
            })
          }
        />
      );
      break;
    case "person":
      title = t("به تیم خوش آمدید", "Welcome to the team");
      description = t(
        "مشخصات همکار و نقش او را در تیم مشخص کنید.",
        "Add your teammate's details and their role in the field.",
      );
      content = (
        <SubmitForm
          fields={[
            {
              name: "name",
              label: t("نام و نام خانوادگی", "Full name"),
              minLength: 2,
            },
            { name: "email", label: t("ایمیل", "Email"), type: "email" },
            {
              name: "username",
              label: t("نام کاربری", "Username"),
              required: false,
              ltr: true,
              minLength: 3,
              maxLength: 32,
              placeholder: "sampler.tehran",
              hint: t(
                "۳ تا ۳۲ نویسه انگلیسی. در صورت خالی بودن، ورود با ایمیل است.",
                "3–32 Latin characters. Leave blank for email sign-in.",
              ),
            },
            {
              name: "role",
              label: t("نقش", "Role"),
              options: [
                { value: "sampler", label: t("سمپلر", "Sampler") },
                { value: "supervisor", label: t("سرپرست", "Supervisor") },
                {
                  value: "coordinator",
                  label: t("هماهنگ‌کننده", "Coordinator"),
                },
                { value: "manager", label: t("مدیر عملیات", "Manager") },
                ...(data.user.role === "admin"
                  ? [
                      {
                        value: "admin",
                        label: t("مدیر سامانه", "Administrator"),
                      },
                    ]
                  : []),
              ],
            },
            { name: "city", label: t("شهر", "City"), default: "تهران" },
            {
              name: "phone",
              label: t("تلفن همراه", "Phone"),
              type: "tel",
              required: false,
            },
            {
              name: "password",
              label: t("رمز عبور اولیه", "Initial password"),
              type: "password",
              minLength: 12,
              hint: t("حداقل ۱۲ کاراکتر", "At least 12 characters"),
            },
          ]}
          action={(v) => submit("/people", v)}
        />
      );
      break;
    case "stock":
      title = t("هر نمونه را ثبت کنیم", "Keep every sample in view");
      description = t(
        "نوع گردش و تعداد واقعی را وارد کنید.",
        "Record the movement type and the actual quantity.",
      );
      content = (
        <SubmitForm
          fields={[
            shiftField,
            {
              name: "kind",
              label: t("نوع گردش", "Movement type"),
              options: [
                {
                  value: "distributed",
                  label: t("توزیع نمونه", "Distribution"),
                },
                {
                  value: "initial",
                  label: t("موجودی اولیه", "Initial receipt"),
                },
                { value: "added", label: t("افزایش موجودی", "Replenishment") },
                { value: "damaged", label: t("آسیب‌دیده", "Damaged") },
                {
                  value: "returned",
                  label: t("برگشت به انبار", "Return to warehouse"),
                },
              ],
            },
            {
              name: "quantity",
              label: t("تعداد", "Quantity"),
              type: "number",
              min: 1,
              max: 1000000,
            },
            {
              name: "note",
              label: t("توضیح", "Note"),
              type: "textarea",
              required: false,
              wide: true,
              max: 1000,
            },
          ]}
          action={(v) =>
            submit(`/shifts/${v.shift_id}/stock`, {
              kind: v.kind,
              quantity: Number(v.quantity),
              note: v.note,
            })
          }
          label={t("ثبت گردش", "Record movement")}
        />
      );
      break;
    case "assign":
      title = t("تیم این شیفت را کامل کنیم", "Complete your shift team");
      content = (
        <SubmitForm
          fields={[
            {
              name: "person_id",
              label: t("انتخاب همکار", "Choose a teammate"),
              options: data.people
                .filter(
                  (p) =>
                    p.role === "sampler" &&
                    !data.shifts
                      .find((s) => s.id === state.id)
                      ?.team.some((x) => x.id === p.id),
                )
                .map((p) => ({ value: p.id, label: p.name + " · " + p.city })),
              wide: true,
            },
          ]}
          action={(v) => submit(`/shifts/${state.id}/assignments`, v)}
          label={t("تخصیص به شیفت", "Assign to shift")}
        />
      );
      break;
    case "issue":
      title = t("با هم حلش می‌کنیم", "Let's work it out, together");
      description = t(
        "مشکل را روشن توضیح دهید تا به دست فرد درست برسد.",
        "A clear description helps the right person take the next step.",
      );
      content = (
        <SubmitForm
          fields={[
            shiftField,
            {
              name: "title",
              label: t("موضوع مشکل", "Issue title"),
              minLength: 5,
              wide: true,
            },
            {
              name: "priority",
              label: t("اولویت پیگیری", "Priority"),
              options: [
                { value: "medium", label: t("متوسط", "Medium") },
                { value: "high", label: t("زیاد", "High") },
                { value: "urgent", label: t("فوری", "Urgent") },
                { value: "low", label: t("کم", "Low") },
              ],
            },
            {
              name: "owner_id",
              label: t("مسئول پیگیری", "Owner"),
              default: "",
              required: false,
              options: [
                { value: "", label: t("سرپرست همان نقطه", "Point supervisor") },
                ...data.people
                  .filter((p) =>
                    ["admin", "manager", "coordinator"].includes(p.role),
                  )
                  .map((p) => ({ value: p.id, label: p.name })),
              ],
            },
            {
              name: "description",
              label: t("شرح اتفاق", "What happened?"),
              type: "textarea",
              required: false,
              wide: true,
            },
          ]}
          action={(v) => submit("/issues", v)}
          label={t("ثبت و ارجاع مشکل", "Create issue")}
        />
      );
      break;
    case "report":
      title = t(
        "یک روز کار خوب، یک گزارش روشن",
        "A good day's work, clearly recorded",
      );
      description = t(
        "پیش از ارسال، خروج تیم و تصاویر اجرا را تکمیل کنید.",
        "Complete check-outs and upload evidence before you submit.",
      );
      content = (
        <SubmitForm
          fields={[
            {
              name: "summary",
              label: t(
                "خلاصه اجرا و بازخورد مخاطبان",
                "Shift summary and customer feedback",
              ),
              type: "textarea",
              minLength: 10,
              wide: true,
              default:
                data.reports.find((r) => r.shift_id === state.id)?.summary ||
                "",
              placeholder: t(
                "امروز چه گذشت؟ نکات مهم و بازخورد مخاطبان را بنویسید…",
                "How did it go? Share the key moments and customer feedback…",
              ),
            },
          ]}
          action={(v) => submit(`/shifts/${state.id}/report`, v)}
          label={t("ارسال برای بررسی", "Submit for review")}
        />
      );
      break;
    case "review": {
      title = t(
        "با دقت ببینیم، با اطمینان تأیید کنیم",
        "Review carefully. Approve confidently",
      );
      wide = true;
      const report = data.reports.find((r) => r.id === state.id);
      const shift = data.shifts.find((s) => s.id === report?.shift_id);
      content = (
        <>
          <ReportContent id={state.id!} />
          <div className="review-checks">
            <CheckItem done={shift?.remaining === 0}>
              {t("تطبیق موجودی پایان شیفت", "Closing stock reconciled")}
            </CheckItem>
            <CheckItem
              done={
                !data.issues.some(
                  (i) =>
                    i.shift_id === report?.shift_id &&
                    i.priority === "urgent" &&
                    i.status !== "resolved",
                )
              }
            >
              {t("بدون مشکل فوری باز", "No unresolved urgent issues")}
            </CheckItem>
          </div>
          <SubmitForm
            fields={[
              {
                name: "status",
                label: t("نتیجه بررسی", "Review decision"),
                options: [
                  {
                    value: "approved",
                    label: t("تأیید نهایی", "Approve report"),
                  },
                  {
                    value: "returned",
                    label: t("بازگشت برای اصلاح", "Return for changes"),
                  },
                ],
                wide: true,
              },
              {
                name: "feedback",
                label: t("بازخورد سرپرست", "Supervisor feedback"),
                type: "textarea",
                required: false,
                wide: true,
                hint: t(
                  "برای بازگشت گزارش، دلیل حداقل ۵ کاراکتری لازم است.",
                  "A reason of at least 5 characters is required when returning a report.",
                ),
              },
            ]}
            action={(v) => submit(`/reports/${state.id}/review`, v)}
            label={t("ثبت نتیجه بررسی", "Save review")}
          />
        </>
      );
      break;
    }
    case "evidence": {
      title = t("لحظه‌های اجرا را ثبت کنیم", "A little proof of a good day");
      description = t(
        "تصویر JPEG یا PNG، حداکثر ۸ مگابایت و ۲۵ مگاپیکسل.",
        "JPEG or PNG, up to 8 MB and 25 megapixels.",
      );
      async function upload(e: FormEvent) {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError("");
        try {
          const body = new FormData();
          body.set("file", file);
          body.set("caption", caption);
          await mutate(`/shifts/${state.id}/evidence`, body);
          notify(t("تصویر با موفقیت ثبت شد", "Photo uploaded"));
          close();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }
      content = (
        <form onSubmit={upload} className="standard-form">
          <label className={`upload-area ${file ? "has-file" : ""}`}>
            <UploadCloud size={36} strokeWidth={1.4} />
            <strong>
              {file
                ? file.name
                : t(
                    "تصویر اجرای خود را انتخاب کنید",
                    "Choose your field photo",
                  )}
            </strong>
            <span>
              {file
                ? n(file.size / 1024 / 1024, { maximumFractionDigits: 1 }) +
                  " MB"
                : t("برای انتخاب فایل کلیک کنید", "Click to choose an image")}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="form-field">
            <span>{t("توضیح تصویر", "Photo caption")}</span>
            <textarea
              rows={3}
              value={caption}
              maxLength={2000}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-footer">
            <Button type="button" onClick={close}>
              {t("انصراف", "Cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={Camera}
              loading={busy}
            >
              {t("بارگذاری تصویر", "Upload photo")}
            </Button>
          </div>
        </form>
      );
      break;
    }
    case "catalog": {
      title = t(
        "یک پایه تازه برای اجرای بهتر",
        "One more piece of a great activation",
      );
      const kind = state.subtype || "brand";
      const fields: Field[] = [
        {
          name: "name",
          label:
            kind === "customer"
              ? t("نام مشتری", "Client name")
              : kind === "brand"
                ? t("نام برند", "Brand name")
                : t("نام محصول", "Product name"),
          wide: true,
          minLength: 2,
        },
      ];
      if (kind !== "customer")
        fields.push({
          name: "parentID",
          label: kind === "brand" ? t("مشتری", "Client") : t("برند", "Brand"),
          options: (kind === "brand" ? data.customers : data.brands).map(
            (x) => ({ value: x.id, label: x.name }),
          ),
          wide: true,
        });
      if (kind === "product")
        fields.push({
          name: "unit",
          label: t("واحد توزیع", "Unit"),
          default: t("نمونه", "sample"),
          wide: true,
        });
      content = (
        <SubmitForm
          fields={fields}
          action={(v) => submit("/catalog", { ...v, kind })}
        />
      );
      break;
    }
    case "export": {
      title = t("گزارش آماده همراهی با شماست", "Take a clear view with you");
      description = t(
        "خروجی CSV سازگار با اکسل، به تفکیک کمپین، شهر، نقطه و وضعیت تأیید.",
        "An Excel-compatible CSV of campaigns, cities, points, and review status.",
      );
      async function download() {
        setBusy(true);
        setError("");
        try {
          const res = await fetch(
            `/api/reports/export?days=${exportDays}&city=${encodeURIComponent(exportCity)}`,
          );
          if (!res.ok) throw new Error((await res.json()).error);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `faracode-operations-${today}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          notify(t("گزارش دریافت شد", "Report downloaded"));
          close();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }
      content = (
        <>
          <div className="export-illustration">
            <FileText size={42} strokeWidth={1.2} />
            <span>CSV</span>
            <ShieldCheck size={22} />
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>{t("بازه گزارش", "Report range")}</span>
              <select
                value={exportDays}
                onChange={(e) => setExportDays(e.target.value)}
              >
                <option value="7">{t("۷ روز گذشته", "Last 7 days")}</option>
                <option value="30">{t("۳۰ روز گذشته", "Last 30 days")}</option>
                <option value="90">{t("۹۰ روز گذشته", "Last 90 days")}</option>
              </select>
            </label>
            <label className="form-field">
              <span>{t("شهر", "City")}</span>
              <select
                value={exportCity}
                onChange={(e) => setExportCity(e.target.value)}
              >
                <option value="">{t("همه شهرها", "All cities")}</option>
                {Array.from(new Set(data.locations.map((l) => l.city))).map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-footer">
            <Button onClick={close}>{t("انصراف", "Cancel")}</Button>
            <Button
              variant="primary"
              icon={ArrowDownToLine}
              loading={busy}
              onClick={download}
            >
              {t("دریافت فایل CSV", "Download CSV")}
            </Button>
          </div>
        </>
      );
      break;
    }
    case "report-detail":
      title = t("داستان این شیفت", "The story of this shift");
      wide = true;
      content = <ReportContent id={state.id!} />;
      break;
    case "location-detail": {
      const l = data.locations.find((x) => x.id === state.id);
      title = l?.name || t("نقطه اجرا", "Location");
      content = l ? (
        <>
          <div className="location-detail-icon">
            <MapPin size={36} strokeWidth={1.4} />
          </div>
          <div className="details-grid">
            <InfoPair label={t("شهر", "City")}>{l.city}</InfoPair>
            <InfoPair label={t("شعاع حضور", "Attendance radius")}>
              {n(l.radius)} {t("متر", "m")}
            </InfoPair>
            <InfoPair label={t("مختصات", "Coordinates")}>
              <span dir="ltr">
                {l.latitude}, {l.longitude}
              </span>
            </InfoPair>
            <InfoPair label={t("نشانی", "Address")}>{l.address}</InfoPair>
          </div>
          <section className="detail-section">
            <h3>{t("شیفت‌های این نقطه", "Shifts at this point")}</h3>
            {data.shifts
              .filter((s) => s.location_id === l.id)
              .map((s) => (
                <button
                  key={s.id}
                  className="related-shift"
                  onClick={() => {
                    close();
                    selectShift(s.id);
                  }}
                >
                  <span>
                    <strong>{s.campaign_name}</strong>
                    <small>
                      {date(s.starts_at)} · {time(s.starts_at)}
                    </small>
                  </span>
                  <Badge value={s.status} />
                </button>
              ))}
          </section>
        </>
      ) : (
        <Empty title={t("نقطه پیدا نشد", "Location not found")} />
      );
      break;
    }
    case "person-detail": {
      const p = data.people.find((x) => x.id === state.id);
      title = t("همراه تیم", "Your teammate");
      content = p ? (
        <>
          <div className="person-detail">
            <Avatar name={p.name} color={p.color} size="large" />
            <h3>{p.name}</h3>
            <span>
              <RoleLabel role={p.role} />
            </span>
          </div>
          <div className="details-grid">
            <InfoPair label={t("شهر", "City")}>{p.city}</InfoPair>
            <InfoPair label={t("ایمیل", "Email")}>
              <span dir="ltr">{p.email || "—"}</span>
            </InfoPair>
            {(data.user.role === "admin" || data.user.id === p.id) && (
              <InfoPair label={t("نام کاربری", "Username")}>
                <span dir="ltr">{p.username || "—"}</span>
              </InfoPair>
            )}
            <InfoPair label={t("تلفن", "Phone")}>{p.phone || "—"}</InfoPair>
            <InfoPair label={t("شیفت‌های مرتبط", "Related shifts")}>
              {n(
                data.shifts.filter(
                  (s) =>
                    s.supervisor_id === p.id ||
                    s.team.some((x) => x.id === p.id),
                ).length,
              )}
            </InfoPair>
          </div>
          {data.user.role === "admin" && (
            <div className="form-footer">
              <Button
                icon={KeyRound}
                onClick={() => open({ kind: "person-credentials", id: p.id })}
              >
                {t("تنظیم نام کاربری و رمز", "Manage sign-in credentials")}
              </Button>
            </div>
          )}
        </>
      ) : null;
      break;
    }
    case "person-credentials": {
      const person = data.people.find((item) => item.id === state.id);
      title = t("اطلاعات ورود همکار", "Teammate sign-in credentials");
      description = person?.name ?? "";
      if (!person || data.user.role !== "admin") break;
      content = (
        <SubmitForm
          fields={[
            {
              name: "username",
              label: t("نام کاربری", "Username"),
              ltr: true,
              required: false,
              minLength: 3,
              maxLength: 32,
              default: person.username,
              wide: true,
              hint: t(
                "نام کاربری جدید یا خالی برای ورود با ایمیل.",
                "Set a username, or leave it blank for email sign-in.",
              ),
            },
            {
              name: "password",
              label: t("رمز عبور جدید", "New password"),
              type: "password",
              required: false,
              minLength: 12,
              wide: true,
              hint: t(
                "خالی بماند تا رمز فعلی حفظ شود. تغییر رمز، نشست‌های وب و موبایل این حساب را می‌بندد.",
                "Leave blank to keep the current password. A reset signs this account out of web and mobile.",
              ),
            },
          ]}
          action={(values) =>
            submit(`/people/${person.id}/credentials`, values, "PATCH")
          }
          label={t("ذخیره اطلاعات ورود", "Save credentials")}
        />
      );
      break;
    }
    case "issue-detail": {
      const i = data.issues.find((x) => x.id === state.id);
      title = i?.title || t("جزئیات مشکل", "Issue details");
      content = i ? (
        <>
          <div className="detail-badges">
            <Badge value={i.priority} />
            <Badge value={i.status} />
          </div>
          <p className="prose-copy">
            {i.description ||
              t("توضیحی ثبت نشده است.", "No description provided.")}
          </p>
          <div className="details-grid">
            <InfoPair label={t("مسئول پیگیری", "Owner")}>
              {i.owner_name}
            </InfoPair>
            <InfoPair label={t("نقطه", "Point")}>{i.location_name}</InfoPair>
            <InfoPair label={t("کمپین", "Campaign")}>
              {i.campaign_name}
            </InfoPair>
            <InfoPair label={t("زمان ثبت", "Reported")}>
              {date(i.created_at)}
            </InfoPair>
          </div>
          <Button
            onClick={() => {
              close();
              selectShift(i.shift_id);
            }}
          >
            {t("مشاهده شیفت مرتبط", "Open related shift")}
          </Button>
        </>
      ) : null;
      break;
    }
    case "audit":
      title = t("ردپای کارهای خوب", "A record of good work");
      description = t(
        "تاریخچه تغییرات و اقدام‌های مهم تیم شما.",
        "Important changes and actions across your team.",
      );
      content = (
        <div className="audit-list">
          {data.events.length ? (
            data.events.map((e) => (
              <div className="audit-row" key={e.id}>
                <Avatar name={e.actor_name} color={e.color} />
                <div>
                  <strong>{e.detail}</strong>
                  <span>
                    {e.actor_name} ·{" "}
                    {date(e.created_at, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty title={t("فعالیتی ثبت نشده", "No activity yet")} />
          )}
        </div>
      );
      break;
    case "notifications":
      title = t(
        "چیزهایی که به توجه شما نیاز دارند",
        "A few things need your attention",
      );
      content = (
        <div className="notification-list">
          {data.issues
            .filter((i) => i.status !== "resolved")
            .map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  close();
                  selectShift(i.shift_id);
                }}
              >
                <span className="notification-icon">
                  <Info size={19} />
                </span>
                <span>
                  <strong>{i.title}</strong>
                  <small>
                    {i.location_name} · {i.owner_name}
                  </small>
                </span>
                <Badge value={i.priority} />
              </button>
            ))}
          {data.reports
            .filter((r) => r.status === "pending")
            .map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  close();
                  selectShift(r.shift_id);
                }}
              >
                <span className="notification-icon teal">
                  <FileText size={19} />
                </span>
                <span>
                  <strong>
                    {t("گزارش آماده بررسی", "Report ready for review")}
                  </strong>
                  <small>
                    {r.location_name} · {r.submitted_name}
                  </small>
                </span>
              </button>
            ))}
          {!data.issues.some((i) => i.status !== "resolved") &&
            !data.reports.some((r) => r.status === "pending") && (
              <Empty title={t("همه‌چیز مرتب است", "You're all caught up")} />
            )}
        </div>
      );
      break;
    case "account": {
      title = t("فضای شما، به سلیقه شما", "Make yourself at home");
      description = t(
        "زبان نمایش و حساب کاربری را اینجا مدیریت کنید.",
        "Manage your language and workspace account.",
      );
      async function switchRole(role: string) {
        setBusy(true);
        setError("");
        try {
          await api("/auth/demo", {
            method: "POST",
            body: JSON.stringify({ role }),
          });
          await refresh();
          close();
          notify(t("نقش آزمایشی تغییر کرد", "Demo role changed"));
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }
      content = (
        <>
          <div className="account-person">
            <Avatar
              name={data.user.name}
              color={data.user.color}
              size="large"
            />
            <div>
              <h3>{data.user.name}</h3>
              <span>
                <RoleLabel role={data.user.role} />
              </span>
              <small dir="ltr">{data.user.email}</small>
            </div>
          </div>
          <label className="form-field">
            <span>
              <Globe2 size={16} /> {t("زبان رابط کاربری", "Interface language")}
            </span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="fa">فارسی · راست به چپ</option>
              <option value="en">English · Left to right</option>
            </select>
          </label>
          {data.demo && (
            <div className="demo-role-section">
              <h3>{t("تجربه نقش‌های مختلف", "Explore different roles")}</h3>
              <p>
                {t(
                  "در محیط آزمایشی، فضای مدیر، سرپرست و سمپلر را ببینید.",
                  "Try the manager, supervisor, and sampler workspaces in this demo.",
                )}
              </p>
              <div className="role-switch-buttons">
                {["admin", "supervisor", "sampler"].map((role) => (
                  <Button
                    key={role}
                    loading={busy}
                    variant={data.user.role === role ? "primary" : "secondary"}
                    onClick={() => switchRole(role)}
                  >
                    <RoleLabel role={role} />
                  </Button>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="form-footer">
            <Button variant="danger" onClick={onSignOut}>
              {t("خروج از حساب", "Sign out")}
            </Button>
            <Button variant="primary" onClick={close}>
              {t("انجام شد", "Done")}
            </Button>
          </div>
        </>
      );
      break;
    }
    case "attendance-help":
    case "help":
      title = t(
        "همراه شما، از برنامه تا اجرا",
        "With you, from planning to the field",
      );
      description = t(
        "یک مسیر ساده برای یک روز منظم و پربار.",
        "A simple path to a well-run, productive day.",
      );
      content = (
        <div className="help-steps">
          {[
            [
              ClipboardList,
              t("برنامه‌ریزی و تکمیل تیم", "Plan and staff"),
              t(
                "کمپین و نقطه را تعریف کنید، شیفت بسازید و همکاران را تخصیص دهید.",
                "Set up a campaign and location, create a shift, and assign your teammates.",
              ),
            ],
            [
              LocateFixed,
              t("ورود در نقطه اجرا", "Check in on location"),
              t(
                "سمپلر با GPS روشن، در شعاع نقطه و با دقت حداکثر ۱۵۰ متر ورود و خروج ثبت می‌کند.",
                "Samplers check in and out within the point's radius, with GPS accuracy of 150 m or better.",
              ),
            ],
            [
              Package,
              t("ثبت نمونه و شواهد", "Record samples and evidence"),
              t(
                "سرپرست آمادگی را تأیید می‌کند؛ تیم توزیع، تصاویر و مشکلات را ثبت می‌کند.",
                "The supervisor confirms readiness. The team records distribution, photos, and issues.",
              ),
            ],
            [
              ShieldCheck,
              t("تطبیق و تأیید گزارش", "Reconcile and review"),
              t(
                "پس از خروج تیم، گزارش ارسال می‌شود. موجودی پایان باید تطبیق داشته باشد و مشکلات فوری حل شوند.",
                "After everyone checks out, submit the report. Reconcile the closing balance and resolve urgent issues before approval.",
              ),
            ],
          ].map(([Icon, heading, copy], i) => {
            const Component = Icon as typeof ClipboardList;
            return (
              <div key={i} className="help-step">
                <span>
                  <Component size={22} />
                </span>
                <div>
                  <h3>{heading as string}</h3>
                  <p>{copy as string}</p>
                </div>
              </div>
            );
          })}
          <div className="information-note">
            <Info size={18} />
            <p>
              {t(
                "برای ثبت حضور، دسترسی موقعیت مرورگر را فعال کنید. اگر ارتباط قطع شود، پیام خطا می‌بینید؛ داده‌ها فقط پس از تأیید سرور ذخیره می‌شوند.",
                "Allow browser location access for attendance. Connection errors are shown clearly; records are saved after server confirmation.",
              )}
            </p>
          </div>
        </div>
      );
      break;
    default:
      title = t("اطلاعات", "Details");
      content = <Empty title={t("موردی برای نمایش نیست", "Nothing to show")} />;
  }
  return (
    <Dialog title={title} description={description} onClose={close} wide={wide}>
      {content}
    </Dialog>
  );
}
