import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./premium.css";
import "./pages.css";
import "./workspace-workflows.css";

export const metadata: Metadata = {
  title: "فراکد | مدیریت هوشمند عملیات سمپلینگ",
  description:
    "از اولین برنامه تا آخرین نمونه؛ کمپین‌ها، تیم‌ها و اجرای میدانی را در یک فضای یکپارچه مدیریت کنید.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
