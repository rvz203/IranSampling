import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fieldApi } from "./api";
import { Badge, Button, Card, Notice, colors, num, styles, time } from "./ui";
import type { Identity, ShiftSummary } from "./types";

export function ShiftSummaryCard({
  auth,
  shiftId,
  online,
}: {
  auth: Identity;
  shiftId: string;
  online: boolean;
}) {
  const [data, setData] = useState<ShiftSummary>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!online) return;
    let stopped = false;
    void fieldApi.shiftSummary(auth, shiftId).then(
      (summary) => {
        if (stopped) return;
        setData(summary);
        setError("");
      },
      (failure) => {
        if (!stopped)
          setError(
            failure instanceof Error
              ? failure.message
              : "خلاصه شیفت بارگیری نشد.",
          );
      },
    );
    return () => {
      stopped = true;
    };
  }, [auth, shiftId, online, attempt]);

  if (!data)
    return (
      <Card>
        {error && <Notice error message={error} />}
        <Text style={styles.muted}>
          {online
            ? error
              ? "دریافت خلاصه را دوباره امتحان کنید."
              : "در حال بارگیری خلاصه خودکار…"
            : "برای دریافت خلاصه خودکار به سرور وصل شوید."}
        </Text>
        {online && error && (
          <Button
            label="تلاش دوباره"
            icon="refresh"
            onPress={() => setAttempt((i) => i + 1)}
          />
        )}
      </Card>
    );
  const { metrics } = data;
  return (
    <Card>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={styles.name}>
          خلاصه خودکار شیفت
        </Text>
        <Badge label={`پایان ${time(data.ended_at)}`} tone="green" />
      </View>
      <View style={local.metrics}>
        {[
          {
            label: "توزیع",
            value: `${num(metrics.distributed)} / ${num(metrics.target)}`,
          },
          { label: "موجودی", value: num(metrics.remaining) },
          { label: "عکس اجرا", value: num(metrics.photo_count) },
          { label: "مشکل باز", value: num(metrics.open_issues) },
        ].map(({ label, value }) => (
          <View key={label} style={local.metric}>
            <Text style={styles.name}>{value}</Text>
            <Text style={styles.muted}>{label}</Text>
          </View>
        ))}
      </View>
      {metrics.team.map((person) => (
        <View key={person.id} style={[styles.row, local.member]}>
          <View style={local.memberName}>
            <Text style={styles.text}>{person.name}</Text>
            {person.ended_automatically && (
              <Text style={styles.muted}>پایان خودکار حضور</Text>
            )}
          </View>
          {person.checked_in_at !== undefined && (
            <Text style={styles.muted}>
              {person.checked_in_at
                ? `${num(person.work_minutes ?? 0)} دقیقه کار`
                : "بدون ثبت حضور"}
            </Text>
          )}
        </View>
      ))}
    </Card>
  );
}

const local = StyleSheet.create({
  metrics: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 4,
  },
  metric: {
    flexGrow: 1,
    minWidth: 80,
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#eef3ec",
  },
  member: { paddingTop: 8, borderTopWidth: 1, borderColor: colors.line },
  memberName: { flex: 1, gap: 3 },
});
