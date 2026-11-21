"use client";

import { useEffect, useRef } from "react";
import { useWorkspace } from "./context";

type Point = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  stale?: boolean;
};

export function mapLocationUrl(latitude: number, longitude: number) {
  return `/api/maps/view#lat=${latitude}&lon=${longitude}`;
}

export function IranMap({
  points,
  routes,
  selected,
  onSelect,
}: {
  points: Point[];
  routes?: [number, number][][];
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const { locale, t } = useWorkspace();
  const frame = useRef<HTMLIFrameElement>(null);
  const snapshot = {
    type: "sampling-map:points",
    language: locale,
    points,
    routes,
    selected,
  };

  useEffect(() => {
    frame.current?.contentWindow?.postMessage(snapshot, window.location.origin);
  }, [snapshot]);

  useEffect(() => {
    function select(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "sampling-map:marker" &&
        points.some((point) => point.id === event.data.id)
      ) {
        onSelect?.(event.data.id);
      }
    }
    window.addEventListener("message", select);
    return () => window.removeEventListener("message", select);
  }, [onSelect, points]);

  return (
    <iframe
      ref={frame}
      className="iran-map-frame"
      src="/api/maps/view"
      loading="lazy"
      title={t("نقشهٔ ایران", "Iran map")}
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          snapshot,
          window.location.origin,
        )
      }
    />
  );
}
