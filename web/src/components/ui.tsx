"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  Inbox,
  LoaderCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { useWorkspace } from "./context";
import { initials } from "@/lib/api";

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <img src="/brand/mark.svg" width={40} height={40} alt="" />
    </span>
  );
}
export function Avatar({
  name,
  color = "teal",
  size = "normal",
}: {
  name: string;
  color?: string;
  size?: "normal" | "small" | "large";
}) {
  return (
    <span title={name} className={`avatar ${color} ${size}`}>
      {initials(name)}
    </span>
  );
}
const states: Record<string, [string, string, string]> = {
  active: ["در حال اجرا", "Active", "green"],
  scheduled: ["برنامه‌ریزی‌شده", "Scheduled", "blue"],
  draft: ["پیش‌نویس", "Draft", "neutral"],
  paused: ["متوقف‌شده", "Paused", "amber"],
  completed: ["پایان‌یافته", "Completed", "neutral"],
  pending: ["در انتظار بررسی", "Pending review", "amber"],
  approved: ["تأییدشده", "Approved", "green"],
  returned: ["برگشت برای اصلاح", "Returned", "rose"],
  open: ["باز", "Open", "rose"],
  in_progress: ["در حال پیگیری", "In progress", "blue"],
  resolved: ["حل‌شده", "Resolved", "green"],
  low: ["کم", "Low", "neutral"],
  medium: ["متوسط", "Medium", "amber"],
  high: ["زیاد", "High", "orange"],
  urgent: ["فوری", "Urgent", "rose"],
  present: ["حاضر", "Present", "green"],
  out: ["خروج ثبت‌شده", "Checked out", "neutral"],
};
export function Badge({ value }: { value: string }) {
  const { t } = useWorkspace();
  const state = states[value] || [value, value, "neutral"];
  return (
    <span className={`badge ${state[2]}`}>
      <span className="status-dot" />
      {t(state[0], state[1])}
    </span>
  );
}
export function RoleLabel({ role }: { role: string }) {
  const { t } = useWorkspace();
  const names: Record<string, [string, string]> = {
    admin: ["مدیر سامانه", "Administrator"],
    manager: ["مدیر عملیات", "Operations manager"],
    coordinator: ["هماهنگ‌کننده", "Coordinator"],
    supervisor: ["سرپرست", "Supervisor"],
    sampler: ["سمپلر", "Sampler"],
  };
  const labels = names[role] || [role, role];
  return <>{t(...labels)}</>;
}
export function Progress({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  return (
    <span
      className={`progress ${compact ? "compact" : ""}`}
      role="progressbar"
      aria-label="Campaign progress"
      aria-valuenow={Math.min(100, Math.round(value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </span>
  );
}
export function Arrow({
  size = 16,
  ...props
}: {
  size?: number;
  className?: string;
}) {
  const { locale } = useWorkspace();
  return locale === "fa" ? (
    <ArrowLeft size={size} {...props} />
  ) : (
    <ArrowRight size={size} {...props} />
  );
}
export function Button({
  children,
  icon: Icon,
  variant = "secondary",
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`button ${variant} ${props.className || ""}`}
    >
      {loading ? (
        <LoaderCircle size={17} className="spin" />
      ) : Icon ? (
        <Icon size={17} />
      ) : null}
      {children}
    </button>
  );
}
export function Empty({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function CardHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Dialog({
  children,
  title,
  description,
  onClose,
  wide = false,
  drawer = false,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`dialog ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="بستن / Close"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={14} />
    </span>
  );
}
export function CheckItem({
  done,
  children,
}: {
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`check-item ${done ? "done" : ""}`}>
      {done ? <Check size={16} /> : <Circle size={16} />}
      <span>{children}</span>
    </div>
  );
}
