import { notFound } from "next/navigation";
import Workspace from "@/components/workspace";
import type { View } from "@/lib/types";

const views = [
  "overview",
  "campaigns",
  "shifts",
  "map",
  "team",
  "attendance",
  "inventory",
  "issues",
  "reports",
  "catalog",
];
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const { view } = await params;
  const current = view?.[0] || "overview";
  if ((view?.length || 0) > 1 || !views.includes(current)) notFound();
  return <Workspace view={current as View} />;
}
