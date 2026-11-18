"use client";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Empty } from "./ui";

export function PageHeading({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  const { data, t, n } = useWorkspace();
  const pages = {
    CAMPAIGNS: {
      asset: "campaigns",
      count: data.campaigns.length,
      label: t("کمپین، یک مسیر روشن", "campaigns, one clear direction"),
    },
    "FIELD SCHEDULE": {
      asset: "shifts",
      count: data.shifts.length,
      label: t("شیفت در برنامه شما", "shifts in your schedule"),
    },
    LOCATIONS: {
      asset: "map",
      count: data.locations.length,
      label: t("نقطه، نزدیک‌تر از همیشه", "locations, closer than ever"),
    },
    "OUR PEOPLE": {
      asset: "team",
      count: data.people.length,
      label: t("همکار، یک تیم هماهنگ", "people, one connected team"),
    },
    ATTENDANCE: {
      asset: "attendance",
      count: data.attendance.length,
      label: t("رکورد حضور قابل بررسی", "traceable attendance records"),
    },
    INVENTORY: {
      asset: "inventory",
      count: data.stock.length,
      label: t("گردش محصول، با جزئیات", "stock movements, in detail"),
    },
    "ISSUES & FOLLOW-UPS": {
      asset: "issues",
      count: data.issues.filter((i) => i.status !== "resolved").length,
      label: t("مورد در مسیر پیگیری", "issues to follow through"),
    },
    "REPORTS & APPROVALS": {
      asset: "reports",
      count: data.reports.length,
      label: t("گزارش، برای تصمیم بهتر", "reports for better decisions"),
    },
    "BRANDS & PRODUCTS": {
      asset: "catalog",
      count: data.products.length,
      label: t("محصول در سبد برندها", "products in your portfolio"),
    },
  };
  const page = pages[eyebrow as keyof typeof pages];
  return (
    <section className={`page-heading ${page ? "page-hero" : ""}`}>
      <div className="page-hero-copy">
        {eyebrow && (
          <span className="eyebrow">
            {page && (
              <img
                src={`/brand/pages/icon-${page.asset}.svg`}
                width={16}
                height={16}
                alt=""
              />
            )}{" "}
            {eyebrow}
          </span>
        )}
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
        {action && <div className="page-actions">{action}</div>}
      </div>
      {page && (
        <div className="page-hero-art">
          <Image
            src={`/brand/pages/${page.asset}.png`}
            width={720}
            height={480}
            alt={t(`تصویر اختصاصی ${title}`, `${title} editorial illustration`)}
            sizes="(max-width: 720px) 100vw, 35vw"
            preload
          />
          <span className="page-art-caption">
            <span className="square-dot" />
            {n(page.count)} {page.label}
          </span>
        </div>
      )}
    </section>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useWorkspace();
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder || t("جست‌وجو", "Search")}
        placeholder={placeholder || t("جست‌وجو…", "Search…")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function CollectionBar({
  query,
  setQuery,
  placeholder,
  children,
  count,
}: {
  query: string;
  setQuery: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
  count?: number;
}) {
  const { t, n } = useWorkspace();
  return (
    <div className="collection-bar">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
      />
      <div className="collection-filters">
        {count !== undefined && (
          <span className="result-count">
            {n(count)} {t("مورد", "results")}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  empty,
  pageSize = 8,
}: {
  rows: T[];
  columns: {
    label: string;
    render: (row: T) => ReactNode;
    className?: string;
  }[];
  empty?: string;
  pageSize?: number;
}) {
  const { t, n, locale } = useWorkspace();
  const [page, setPage] = useState(1);
  const pages = Math.ceil(rows.length / pageSize);
  const activePage = Math.max(1, Math.min(page, pages));
  const visible = rows.slice(
    (activePage - 1) * pageSize,
    activePage * pageSize,
  );
  return (
    <>
      {rows.length === 0 ? (
        <Empty
          title={empty || t("موردی پیدا نشد", "No results found")}
          description={t(
            "فیلترها را تغییر دهید یا یک مورد جدید اضافه کنید.",
            "Try different filters or add a new item.",
          )}
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={i} className={c.className}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c, i) => (
                      <td key={i} className={c.className}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {t("نمایش", "Showing")} {n((activePage - 1) * pageSize + 1)}–
              {n(Math.min(activePage * pageSize, rows.length))} {t("از", "of")}{" "}
              {n(rows.length)} {t("مورد", "items")}
            </span>
            <div className="pagination">
              <button
                aria-label={t("صفحه قبل", "Previous page")}
                disabled={activePage <= 1}
                onClick={() => setPage(activePage - 1)}
              >
                {locale === "fa" ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronLeft size={16} />
                )}
              </button>
              <span>{n(activePage)}</span>
              <button
                aria-label={t("صفحه بعد", "Next page")}
                disabled={activePage >= pages}
                onClick={() => setPage(activePage + 1)}
              >
                {locale === "fa" ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
