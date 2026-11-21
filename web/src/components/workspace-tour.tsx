"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Flag,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Package,
  Settings2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import type { View } from "@/lib/types";
import { useWorkspace } from "./context";
import { Button } from "./ui";

const steps = [
  {
    view: "overview",
    icon: LayoutDashboard,
    fa: "نمای کلی",
    en: "Overview",
    copy: [
      "هدف توزیع، پیشرفت کمپین‌ها و فعالیت اخیر تیم را هر روز از اینجا دنبال کنید.",
      "Check distribution targets, campaign progress, and recent team activity here each day.",
    ],
  },
  {
    view: "campaigns",
    icon: Megaphone,
    fa: "کمپین‌ها",
    en: "Campaigns",
    copy: [
      "کمپین را باز کنید تا شیفت‌ها، پیام‌های تیم و تاریخچهٔ همان کمپین را ببینید.",
      "Open a campaign to see its shifts, team conversation, and activity history.",
    ],
  },
  {
    view: "shifts",
    icon: CalendarDays,
    fa: "برنامه و تیم شیفت",
    en: "Shift schedule and team",
    copy: [
      "جزئیات هر شیفت، نام سرپرست و سمپلرها را نشان می‌دهد. ادمین ساعت کار، ناهار و اعضای تیم را از «ویرایش برنامه و تیم» تنظیم می‌کند.",
      "Open a shift to see its lead and samplers. Admins use Edit schedule and team to set working hours, lunch, and the roster.",
    ],
  },
  {
    view: "map",
    icon: MapPin,
    fa: "نقشه عملیات",
    en: "Operations map",
    copy: [
      "کمپین یا شیفت را برای دیدن موقعیت زنده انتخاب کنید. ادمین از جزئیات شیفت، مسیر ثبت‌شدهٔ هر نفر را در تب «تاریخچه موقعیت» می‌بیند.",
      "Filter live locations by campaign or shift. Admins can open a shift’s Location history tab to review each person’s route.",
    ],
  },
  {
    view: "team",
    icon: Users,
    fa: "تیم و همکاران",
    en: "People and teams",
    copy: [
      "همکاران، نقش‌ها و شیفت‌های هر نفر را ببینید. ادمین از کارت افراد، نام کاربری و رمز ورودشان را مدیریت می‌کند.",
      "Find your teammates, their roles, and assigned shifts. Admins manage sign-in details from each person’s profile.",
    ],
  },
  {
    view: "attendance",
    icon: UserRoundCheck,
    fa: "حضور و غیاب",
    en: "Attendance",
    copy: [
      "ورود و خروج هر شیفت را مرور کنید. اپ میدانی اشتراک موقعیت را همراه با ثبت ورود فعال می‌کند و هنگام ناهار ثبت را متوقف می‌کند.",
      "Review shift check-ins and check-outs. The field app offers location sharing at check-in and pauses recording over lunch.",
    ],
  },
  {
    view: "inventory",
    icon: Package,
    fa: "موجودی و توزیع",
    en: "Stock and distribution",
    copy: [
      "تحویل اولیه، توزیع، آسیب‌دیدگی و برگشتی را در دفتر موجودی همان شیفت ثبت کنید.",
      "Record deliveries, distribution, damage, and returns in the shift’s stock ledger.",
    ],
  },
  {
    view: "issues",
    icon: Flag,
    fa: "مشکلات و پیگیری‌ها",
    en: "Issues and follow-ups",
    copy: [
      "مشکل را به شیفت متصل کنید، اولویت بدهید و پیگیری آن را به همکار مناسب بسپارید.",
      "Link an issue to a shift, set its priority, and assign it to the right teammate.",
    ],
  },
  {
    view: "reports",
    icon: ClipboardCheck,
    fa: "گزارش پایان شیفت",
    en: "End-of-shift reports",
    copy: [
      "پس از پایان شیفت، حضور، توزیع، موجودی و شواهد در «خلاصه‌های خودکار» ثبت می‌شوند. گزارش‌های ارسالی را از همین صفحه بررسی کنید.",
      "Automatic summaries capture attendance, distribution, stock, and evidence at closeout. Review submitted reports on the same page.",
    ],
  },
  {
    view: "catalog",
    icon: Building2,
    fa: "برندها و محصولات",
    en: "Brands and products",
    copy: [
      "مشتری، برند و محصول را اینجا مدیریت کنید تا هنگام ساخت کمپین قابل انتخاب باشند.",
      "Manage customers, brands, and products so they’re available when you create a campaign.",
    ],
  },
  {
    view: "overview",
    icon: Bell,
    target: "toolbar",
    fa: "جست‌وجو و اعلان‌ها",
    en: "Search and notifications",
    copy: [
      "با جست‌وجوی بالای صفحه سریع به شیفت و کمپین برسید. زنگ اعلان، گزارش‌های در انتظار و موارد نیازمند رسیدگی را نشان می‌دهد.",
      "Use the top bar to jump to shifts and campaigns. The bell shows pending reports and items that need attention.",
    ],
  },
  {
    view: "overview",
    icon: Settings2,
    target: "account",
    fa: "حساب و تنظیمات",
    en: "Account and settings",
    copy: [
      "از منوی حساب، زبان پنل و تنظیمات فضای کار را تغییر دهید. برای دیدن دوباره این تور، از فهرست «راهنمای شروع» را باز کنید.",
      "Change language and workspace preferences from your account menu. Revisit this tour any time from Take a quick tour in the sidebar.",
    ],
  },
] satisfies {
  view: View;
  icon: typeof CalendarDays;
  fa: string;
  en: string;
  target?: string;
  copy: [string, string];
}[];

const pathFor = (view: View) => (view === "overview" ? "/" : `/${view}`);

export function WorkspaceTour({ view }: { view: View }) {
  const parameters = useSearchParams();
  const number = parameters.get("tour");
  const index = number && /^\d+$/.test(number) ? Number(number) : -1;
  const step = steps[index];
  if (!step || step.view !== view) return null;
  return <TourDialog index={index} />;
}

function TourDialog({ index }: { index: number }) {
  const { t, locale, n } = useWorkspace();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = steps[index];
  const Icon = step.icon;
  const backArrow = locale === "fa" ? ArrowRight : ArrowLeft;
  const nextArrow = locale === "fa" ? ArrowLeft : ArrowRight;

  useEffect(() => {
    const overlay = dialog.current;
    overlay?.showModal();
    return () => overlay?.close();
  }, []);

  useEffect(() => {
    const target = document.querySelector(
      `[data-tour="${step.target ?? "page"}"]`,
    );
    if (!target) return;
    const move = () => setBox(target.getBoundingClientRect());
    move();
    const observer = new ResizeObserver(move);
    observer.observe(target);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [step]);

  const go = (next: number) =>
    router.replace(`${pathFor(steps[next].view)}?tour=${next}`, {
      scroll: false,
    });
  const close = () => router.replace(pathFor(step.view), { scroll: false });
  const final = index === steps.length - 1;
  return (
    <dialog
      ref={dialog}
      className="workspace-tour"
      aria-label={t("تور راهنمای شروع", "Workspace tour")}
      aria-describedby="tour-copy"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {box && box.width > 0 && box.height > 0 && box.bottom > 0 ? (
        <span
          aria-hidden="true"
          className="tour-spotlight"
          style={{
            left: box.left - 5,
            top: box.top - 5,
            width: box.width + 10,
            height: box.height + 10,
          }}
        />
      ) : (
        <span aria-hidden="true" className="tour-shade" />
      )}
      <div className="tour-card">
        <div className="tour-card-top">
          <span className="tour-icon">
            <Icon size={25} />
          </span>
          <div>
            <small>{t("راهنمای شروع", "Getting started")}</small>
            <span className="tour-count">
              {n(index + 1)} / {n(steps.length)}
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t("بستن تور", "Close tour")}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div aria-live="polite">
          <h2>{t(step.fa, step.en)}</h2>
          <p id="tour-copy">{t(...step.copy)}</p>
        </div>
        <progress
          aria-label={t("پیشرفت تور", "Tour progress")}
          max={steps.length}
          value={index + 1}
        />
        <div className="tour-card-actions">
          <Button
            icon={backArrow}
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            {t("قبلی", "Back")}
          </Button>
          <Button
            variant="primary"
            icon={final ? Check : nextArrow}
            autoFocus
            onClick={() => (final ? close() : go(index + 1))}
          >
            {final
              ? t("پایان راهنما", "Finish tour")
              : t("گام بعدی", "Next step")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
