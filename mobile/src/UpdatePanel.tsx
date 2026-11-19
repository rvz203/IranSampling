import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, colors, Icon, num } from "./ui";
import type { FieldUpdate } from "./useFieldUpdate";

const mint = "#bff0d4";
const pale = "#d0ded6";
const entries = {
  checking: ["در حال بررسی نسخه", "sync"],
  downloading: ["در حال دریافت به‌روزرسانی", "cloud-download-outline"],
  ready: ["به‌روزرسانی آماده است", "check-circle-outline"],
  current: ["آخرین نسخهٔ سازگار روی دستگاه است", "check-circle-outline"],
  disabled: ["بررسی نسخه در ساخت توزیع فعال می‌شود", "information-outline"],
  "download-failed": ["دریافت نسخه کامل نشد", "alert-circle-outline"],
  "apply-failed": ["اعمال نسخه کامل نشد", "alert-circle-outline"],
} as const;

function useEntrance(reduceMotion: boolean) {
  const [entrance] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduceMotion]);
  return {
    opacity: reduceMotion ? 1 : entrance,
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  };
}

function Progress({
  value,
  reduceMotion,
}: {
  value: number | undefined;
  reduceMotion: boolean;
}) {
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const target = value ?? 0;
    if (reduceMotion) {
      fill.setValue(target);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: target,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, reduceMotion, value]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="دریافت به‌روزرسانی"
      accessibilityValue={
        value === undefined
          ? undefined
          : { min: 0, max: 100, now: Math.round(value * 100) }
      }
      style={local.track}
    >
      <Animated.View style={[local.fill, { transform: [{ scaleX: fill }] }]} />
    </View>
  );
}

export function UpdatePanel({ update }: { update: FieldUpdate }) {
  if (update.phase === "idle" || update.phase === "applying") return null;
  return (
    <UpdateStatus key={update.phase} update={update} phase={update.phase} />
  );
}

function UpdateStatus({
  update,
  phase,
}: {
  update: FieldUpdate;
  phase: keyof typeof entries;
}) {
  const entrance = useEntrance(update.reduceMotion);
  const [title, icon] = entries[phase];
  const downloading = phase === "downloading";
  const retryDownload = phase === "download-failed";
  const retryApply = phase === "apply-failed";
  const progress =
    typeof update.progress === "number" && Number.isFinite(update.progress)
      ? Math.max(0, Math.min(1, update.progress))
      : undefined;
  const detail =
    phase === "ready"
      ? update.canReload
        ? "نسخه تا لحظاتی دیگر اعمال می‌شود."
        : "پس از پایان کار جاری، نسخه خودکار اعمال می‌شود."
      : retryDownload
        ? "اتصال را بررسی کنید و دوباره تلاش کنید."
        : retryApply
          ? "به‌روزرسانی دریافت شده و آمادهٔ تلاش دوباره است."
          : null;
  return (
    <Animated.View testID="app-update-status" style={[local.status, entrance]}>
      <View style={local.statusRow}>
        <View style={local.badge} accessible={false}>
          {downloading && progress === undefined ? (
            <ActivityIndicator
              size="small"
              color={mint}
              animating={!update.reduceMotion}
            />
          ) : (
            <Icon name={icon} size={22} color={mint} />
          )}
        </View>
        <View style={local.message}>
          <Text accessibilityLiveRegion="polite" style={local.label}>
            {title}
          </Text>
          {detail ? <Text style={local.detail}>{detail}</Text> : null}
        </View>
        {downloading && progress !== undefined ? (
          <Text style={local.percent}>{num(Math.round(progress * 100))}٪</Text>
        ) : null}
      </View>
      {downloading ? (
        <Progress value={progress} reduceMotion={update.reduceMotion} />
      ) : null}
      {retryDownload || retryApply ? (
        <View style={local.retry}>
          <Button
            label="تلاش دوباره"
            icon="refresh"
            disabled={retryApply && !update.canReload}
            onPress={retryApply ? update.apply : update.check}
            testID="retry-app-update"
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function CheckUpdateButton({ update }: { update: FieldUpdate }) {
  const busy = update.phase === "checking" || update.phase === "downloading";
  if (
    update.phase === "ready" ||
    update.phase === "apply-failed" ||
    update.phase === "download-failed"
  )
    return null;
  return (
    <Pressable
      testID="check-app-update"
      accessibilityRole="button"
      accessibilityLabel="بررسی به‌روزرسانی برنامه"
      accessibilityState={{ disabled: busy, busy }}
      onPress={update.check}
      disabled={busy}
      style={({ pressed }) => [
        local.check,
        pressed && { backgroundColor: colors.greenWash },
      ]}
    >
      <Icon name="update" size={19} color={colors.green} />
      <Text style={local.checkText}>بررسی نسخه</Text>
      {update.version ? (
        <Text style={local.version}>{update.version}</Text>
      ) : null}
    </Pressable>
  );
}

export function UpdateInstallation({ update }: { update: FieldUpdate }) {
  if (update.phase !== "applying") return null;
  return <Installing reduceMotion={update.reduceMotion} />;
}

function Installing({ reduceMotion }: { reduceMotion: boolean }) {
  const entrance = useEntrance(reduceMotion);
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(pulse, {
        duration: 1250,
        toValue: 1,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <Modal transparent onRequestClose={() => {}} statusBarTranslucent>
      <View style={local.backdrop}>
        <Animated.View
          style={[local.install, entrance]}
          accessibilityViewIsModal
          testID="app-update-installing"
        >
          <View style={local.emblem} accessible={false}>
            <Animated.View
              style={[
                local.ring,
                !reduceMotion && {
                  opacity: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 0],
                  }),
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.35],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View style={local.emblemFace}>
              <Icon name="cellphone-arrow-down" size={36} color={mint} />
            </View>
          </View>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={local.installTitle}
          >
            در حال نصب نسخهٔ جدید
          </Text>
          <Text style={local.installText}>اپ تا لحظاتی دیگر باز می‌شود.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  status: {
    padding: 15,
    borderRadius: 18,
    gap: 12,
    backgroundColor: colors.dark,
  },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2c4337",
  },
  message: { flex: 1, minWidth: 0, gap: 3 },
  label: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
    textAlign: "right",
    writingDirection: "rtl",
  },
  detail: {
    color: pale,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "right",
    writingDirection: "rtl",
  },
  percent: {
    color: mint,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  track: {
    backgroundColor: "#384e43",
    borderRadius: 5,
    height: 5,
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mint,
    borderRadius: 5,
    transformOrigin: "right center",
  },
  retry: { alignSelf: "flex-end" },
  check: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  checkText: { color: colors.green, fontSize: 14, fontWeight: "700" },
  version: {
    color: colors.sub,
    fontSize: 13,
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"],
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(12, 24, 18, .66)",
  },
  install: {
    width: "100%",
    maxWidth: 390,
    borderWidth: 1,
    borderColor: "#3d594a",
    borderRadius: 26,
    paddingHorizontal: 21,
    paddingVertical: 30,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dark,
  },
  emblem: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  emblemFace: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#2c4337",
    borderWidth: 1,
    borderColor: "#527461",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    borderColor: "#8dc5a6",
  },
  installTitle: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 21,
    textAlign: "center",
    writingDirection: "rtl",
  },
  installText: {
    color: pale,
    fontSize: 14,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
