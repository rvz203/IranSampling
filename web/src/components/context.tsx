"use client";
import { createContext, useContext } from "react";
import type { DialogState, Locale, WorkspaceData } from "@/lib/types";

export type WorkspaceContext = {
  data: WorkspaceData;
  locale: Locale;
  t: (fa: string, en: string) => string;
  n: (number: number, options?: Intl.NumberFormatOptions) => string;
  date: (date: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  time: (date: string | Date) => string;
  planner: boolean;
  reviewer: boolean;
  refresh: () => Promise<void>;
  open: (state: NonNullable<DialogState>) => void;
  close: () => void;
  notify: (message: string, error?: boolean) => void;
  selectShift: (id: string) => void;
  selectCampaign: (id: string) => void;
  mutate: (path: string, body?: unknown, method?: string) => Promise<void>;
};
export const Context = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace provider is missing");
  return context;
}
