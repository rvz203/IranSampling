import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ImagePickerAsset } from "expo-image-picker";
import { fieldApi } from "./api";
import { enqueuePhoto, pickPhoto } from "./photos";
import { IranMap, IranMapDetail } from "./IranMap";
import { attendanceFix } from "./tracking";
import { trackingPhase } from "./location-policy";
import { ShiftSummaryCard } from "./ShiftSummaryCard";
import {
  Badge,
  Button,
  Card,
  colors,
  day,
  Field,
  Notice,
  num,
  Section,
  styles,
  time,
} from "./ui";
import type {
  Identity,
  Priority,
  Report,
  Shift,
  TrackingState,
  Workspace,
} from "./types";

type Form = "stock" | "issue" | "report" | "review" | "photo";
type Run = (key: string, action: () => Promise<void>) => void;
const shifts = {
  scheduled: "در برنامه",
  active: "فعال",
  completed: "پایان‌یافته",
};
const reportNames = {
  pending: "در انتظار بررسی",
  returned: "بازگشت برای اصلاح",
  approved: "تأیید نهایی",
};
const priorities: { value: Priority; label: string }[] = [
  { value: "low", label: "کم" },
  { value: "medium", label: "متوسط" },
  { value: "high", label: "زیاد" },
  { value: "urgent", label: "فوری" },
];
const stockKinds = [
  { value: "initial", label: "دریافت اولیه" },
  { value: "added", label: "افزایش" },
  { value: "distributed", label: "توزیع" },
  { value: "damaged", label: "آسیب‌دیده" },
  { value: "returned", label: "برگشتی" },
];

export function ShiftCard({
  shift,
  onPress,
}: {
  shift: Shift;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`شیفت ${shift.location_name}`}
      testID={`shift-${shift.id}`}
      onPress={onPress}
      style={({ pressed }) => [local.shiftCard, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={[styles.name, { flex: 1 }]}>{shift.location_name}</Text>
        <Badge
          label={shift.ended_at ? "پایان‌یافته" : shifts[shift.status]}
          tone={
            !shift.ended_at && shift.status === "active" ? "green" : "neutral"
          }
        />
      </View>
      <Text style={styles.muted}>{shift.campaign_name}</Text>
      <View style={local.divider} />
      <View style={styles.row}>
        <Text style={styles.muted}>
          {day(shift.starts_at)} · {time(shift.starts_at)} تا{" "}
          {time(shift.ends_at)}
        </Text>
        <Text style={local.link}>جزئیات شیفت ‹</Text>
      </View>
    </Pressable>
  );
}

function Choices({
  values,
  selected,
  select,
}: {
  values: { value: string; label: string }[];
  selected: string;
  select: (value: string) => void;
}) {
  return (
    <View style={local.choices}>
      {values.map((option) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selected === option.value }}
          key={option.value}
          onPress={() => select(option.value)}
          style={[
            local.choice,
            selected === option.value && local.choiceActive,
          ]}
        >
          <Text
            style={[
              local.choiceText,
              selected === option.value && { color: colors.white },
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type Props = {
  auth: Identity;
  data: Workspace;
  shift: Shift;
  track: TrackingState | null;
  online: boolean;
  busy: string | null;
  run: Run;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  share: (shiftId: string) => Promise<void>;
  stop: () => Promise<void>;
  notice: (value: string) => void;
  onBack: () => void;
};

export function ShiftScreen({
  auth,
  data,
  shift,
  track,
  online,
  busy,
  run,
  refresh,
  sync,
  share,
  stop,
  notice,
  onBack,
}: Props) {
  const [form, setForm] = useState<Form | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const point = {
    id: shift.id,
    label: shift.location_name,
    latitude: shift.latitude,
    longitude: shift.longitude,
  };
  const attendance = data.attendance.find(
    (a) => a.shift_id === shift.id && a.person_id === auth.user.id,
  );
  const report = data.reports.find((r) => r.shift_id === shift.id);
  const supervisor =
    auth.user.role === "supervisor" && shift.supervisor_id === auth.user.id;
  const assigned = supervisor || shift.team.some((p) => p.id === auth.user.id);
  const present = !!attendance && !attendance.checked_out_at;
  const sharing = track?.shift_id === shift.id;
  const pending = report?.status === "pending";
  const complete = shift.status === "completed";
  const ended = !!shift.ended_at || complete;
  const locked = pending || complete;
  const issues = data.issues.filter((i) => i.shift_id === shift.id);
  const photos = data.evidence.filter((e) => e.shift_id === shift.id);
  const attendanceRows = data.attendance.filter((a) => a.shift_id === shift.id);
  const now = Date.now() + (sharing ? track.clockOffset : 0);
  const phase = sharing ? trackingPhase(track, now) : null;
  const canArrive =
    now >= Date.parse(shift.starts_at) - 3_600_000 &&
    now < Date.parse(shift.ends_at) &&
    !ended;

  const check = (action: "check-in" | "check-out", startSharing = false) =>
    run(action, async () => {
      const fix = await attendanceFix();
      await fieldApi.attendance(auth, shift.id, action, fix);
      try {
        if (startSharing) await share(shift.id);
        if (action === "check-out" && sharing) await stop().catch(() => {});
        notice(
          action === "check-out"
            ? "خروج ثبت شد و اشتراک موقعیت پایان یافت."
            : startSharing
              ? "ورود ثبت شد. برنامه کار و استراحت برای اشتراک اعمال می‌شود."
              : "ورود ثبت شد. می‌توانید اشتراک موقعیت را از همین صفحه شروع کنید.",
        );
      } finally {
        await refresh();
      }
    });
  const sharingNotice =
    "در ساعات کار، اپ حدود هر ۳۰ ثانیه موقعیت را برای ادمین و سرپرست همین شیفت ثبت می‌کند. در استراحت ثبت متوقف می‌شود و بعد خودکار ادامه می‌یابد. نمونه‌های آفلاین در صف می‌مانند.";
  const confirmShare = (arrival = false) =>
    Alert.alert("اشتراک موقعیت این شیفت", sharingNotice, [
      { text: "انصراف", style: "cancel" },
      ...(arrival
        ? [{ text: "فقط ثبت ورود", onPress: () => check("check-in") }]
        : []),
      {
        text: arrival ? "ورود و شروع اشتراک" : "شروع اشتراک",
        onPress: () =>
          arrival
            ? check("check-in", true)
            : run("share", () => share(shift.id)),
      },
    ]);
  const confirmEnd = () =>
    Alert.alert(
      "پایان شیفت",
      "اشتراک موقعیت تیم پایان می‌یابد و خلاصه خودکار با اطلاعات ثبت‌شده ساخته می‌شود.",
      [
        { text: "انصراف", style: "cancel" },
        {
          text: "پایان شیفت",
          onPress: () =>
            run("end", async () => {
              await fieldApi.mutate(auth, `/shifts/${shift.id}/end`, {});
              if (sharing) await stop().catch(() => {});
              await refresh();
              notice("شیفت پایان یافت و خلاصه خودکار ساخته شد.");
            }),
        },
      ],
    );

  return (
    <View style={local.content}>
      <Button label="بازگشت به شیفت‌ها" icon="arrow-right" onPress={onBack} />
      <View style={local.shiftHeading}>
        <View style={styles.row}>
          <Badge
            label={ended ? "پایان‌یافته" : shifts[shift.status]}
            tone={!ended && shift.status === "active" ? "green" : "neutral"}
          />
          <Text style={styles.muted}>{shift.brand_name}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {shift.location_name}
        </Text>
        <Text style={styles.text}>{shift.campaign_name}</Text>
        <Text style={styles.muted}>
          {day(shift.starts_at)} · {time(shift.starts_at)} تا{" "}
          {time(shift.ends_at)} به وقت تهران
        </Text>
        {shift.break_starts_at && shift.break_ends_at ? (
          <View style={local.breakRow}>
            <Text style={styles.text}>استراحت ناهار</Text>
            <Text style={styles.muted}>
              {time(shift.break_starts_at)} تا {time(shift.break_ends_at)} ·
              توقف ثبت موقعیت
            </Text>
          </View>
        ) : null}
        {shift.address ? (
          <Text style={styles.muted}>{shift.address}</Text>
        ) : null}
        {online && data.map_available ? (
          <Button
            label="باز کردن محل اجرا روی نقشه"
            icon="map-marker-outline"
            onPress={() => setMapOpen(true)}
          />
        ) : null}
      </View>
      {online && data.map_available && (
        <IranMap origin={auth.origin} points={[point]} />
      )}
      {online && data.map_available && mapOpen && (
        <IranMapDetail
          origin={auth.origin}
          point={point}
          close={() => setMapOpen(false)}
        />
      )}
      {assigned && (
        <Section title="حضور و موقعیت">
          <Card>
            <View style={styles.row}>
              <Text style={styles.name}>
                {attendance?.ended_automatically
                  ? "حضور با پایان شیفت بسته شد"
                  : attendance?.checked_out_at
                    ? "ورود و خروج ثبت شده"
                    : present
                      ? "در محل شیفت ثبت شده‌اید"
                      : "حضور ثبت نشده"}
              </Text>
              <Badge
                label={
                  phase === "break"
                    ? "استراحت"
                    : phase === "before_work"
                      ? "پیش از شروع کار"
                      : phase === "working"
                        ? "اشتراک فعال"
                        : "بدون اشتراک"
                }
                tone={phase === "working" ? "green" : "neutral"}
              />
            </View>
            {present ? (
              <Text style={styles.muted}>
                ورود {time(attendance.checked_in_at)}
              </Text>
            ) : null}
            {!attendance && !locked && !ended && (
              <Button
                testID="check-in"
                label="ثبت ورود با GPS"
                icon="login"
                variant="dark"
                busy={busy === "check-in"}
                disabled={!online || !canArrive || !!busy}
                onPress={() => confirmShare(true)}
              />
            )}
            {!attendance && !locked && !ended && !canArrive && (
              <Text style={styles.muted}>
                ثبت ورود در بازه مجاز شیفت فعال می‌شود.
              </Text>
            )}
            {present && !ended && (
              <>
                {sharing ? (
                  <>
                    <Notice
                      message={
                        phase === "break"
                          ? "ثبت موقعیت در زمان ناهار متوقف است و پس از استراحت خودکار ادامه می‌یابد."
                          : phase === "before_work"
                            ? "ثبت موقعیت هنگام شروع ساعات کار آغاز می‌شود."
                            : track.background
                              ? "موقعیت در پس‌زمینه هم ثبت می‌شود. در قطع اینترنت، نمونه‌ها در صف باقی می‌مانند."
                              : "موقعیت فقط هنگام باز بودن اپ ثبت می‌شود. برای اشتراک در پس‌زمینه، دسترسی همیشگی مکان را در تنظیمات دستگاه فعال کنید و اشتراک را دوباره شروع کنید."
                      }
                    />
                    <Button
                      testID="stop-tracking"
                      label="توقف اشتراک موقعیت"
                      variant="danger"
                      icon="stop-circle-outline"
                      disabled={!!busy}
                      onPress={() => run("stop", stop)}
                    />
                  </>
                ) : (
                  <Button
                    testID="start-tracking"
                    label="شروع اشتراک موقعیت"
                    icon="crosshairs-gps"
                    variant="dark"
                    busy={busy === "share"}
                    disabled={
                      !online ||
                      locked ||
                      !!busy ||
                      now >= Date.parse(shift.ends_at)
                    }
                    onPress={() => confirmShare()}
                  />
                )}
                <Button
                  testID="check-out"
                  label="ثبت خروج با GPS"
                  icon="logout"
                  busy={busy === "check-out"}
                  disabled={!online || !!busy}
                  onPress={() => check("check-out")}
                />
              </>
            )}
            {!online && (
              <Text style={styles.muted}>
                ثبت ورود و خروج به اتصال سرور نیاز دارد. داده‌های موقعیت و عکس
                در صف می‌مانند.
              </Text>
            )}
          </Card>
        </Section>
      )}
      <Section title="اجرای شیفت">
        <Card>
          <View style={local.metrics}>
            {[
              ["هدف", shift.target],
              ["توزیع", shift.distributed],
              ["موجودی", shift.remaining],
            ].map(([label, value]) => (
              <View key={label} style={local.metric}>
                <Text style={styles.muted}>{label}</Text>
                <Text style={local.metricValue}>{num(Number(value))}</Text>
              </View>
            ))}
          </View>
          <Badge
            label={shift.ready ? "آمادگی تأیید شده" : "در انتظار تأیید آمادگی"}
            tone={shift.ready ? "green" : "amber"}
          />
          {shift.instructions ? (
            <Text style={styles.text}>{shift.instructions}</Text>
          ) : null}
          {supervisor && !shift.ready && !locked && (
            <Button
              testID="ready"
              label="تأیید آمادگی نقطه"
              icon="check-circle-outline"
              disabled={!online || !!busy}
              busy={busy === "ready"}
              onPress={() =>
                run("ready", async () => {
                  await fieldApi.mutate(
                    auth,
                    `/shifts/${shift.id}/readiness`,
                    {},
                  );
                  notice("آمادگی ثبت شد.");
                  await refresh();
                })
              }
            />
          )}
          {!locked && (present || supervisor) && (
            <Button
              label="ثبت توزیع و موجودی"
              icon="package-variant-closed"
              disabled={!online || !!busy}
              onPress={() => setForm(form === "stock" ? null : "stock")}
            />
          )}
          {!complete && (
            <Button
              testID="add-photo"
              label="ثبت عکس اجرا"
              icon="camera-outline"
              disabled={!!busy}
              onPress={() => setForm(form === "photo" ? null : "photo")}
            />
          )}
          {!complete && (
            <Button
              label="ثبت مشکل"
              icon="flag-outline"
              disabled={!online || !!busy}
              onPress={() => setForm(form === "issue" ? null : "issue")}
            />
          )}
        </Card>
      </Section>
      {form && (
        <ShiftForm
          key={form}
          auth={auth}
          shift={shift}
          form={form}
          report={report}
          online={online}
          busy={busy}
          run={run}
          close={() => setForm(null)}
          refresh={refresh}
          sync={sync}
          notice={notice}
        />
      )}
      <Section title="تیم شیفت">
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>{shift.supervisor_name}</Text>
            <Badge label="سرپرست" />
          </View>
          {shift.team.map((person) => {
            const a = attendanceRows.find((x) => x.person_id === person.id);
            return (
              <View style={styles.row} key={person.id}>
                <Text style={styles.text}>{person.name}</Text>
                {(supervisor || person.id === auth.user.id) && (
                  <Badge
                    label={
                      a?.ended_automatically
                        ? "پایان خودکار حضور"
                        : a?.checked_out_at
                          ? "خروج ثبت شده"
                          : a
                            ? "حاضر"
                            : "در انتظار ورود"
                    }
                    tone={a && !a.checked_out_at ? "green" : "neutral"}
                  />
                )}
              </View>
            );
          })}
        </Card>
      </Section>
      <Section title="عکس‌های شیفت">
        {photos.length ? (
          photos.map((photo) => (
            <Card key={photo.id}>
              <Image
                source={{
                  uri: `${auth.origin}/api/evidence/${encodeURIComponent(photo.id)}`,
                  headers: { Authorization: `Bearer ${auth.token}` },
                }}
                accessibilityLabel={photo.caption || "عکس اجرای شیفت"}
                style={local.photo}
                resizeMode="cover"
              />
              <Text style={styles.text}>{photo.caption || "عکس اجرا"}</Text>
              <Text style={styles.muted}>{photo.person_name}</Text>
            </Card>
          ))
        ) : (
          <Card>
            <Text style={styles.muted}>
              هنوز عکسی به سرور نرسیده است. وضعیت ارسال را در صفحه صف ببینید.
            </Text>
          </Card>
        )}
      </Section>
      <Section title="مشکلات شیفت">
        {issues.length ? (
          issues.map((issue) => (
            <Card key={issue.id}>
              <View style={styles.row}>
                <Text style={[styles.name, { flex: 1 }]}>{issue.title}</Text>
                <Badge
                  label={
                    issue.status === "resolved"
                      ? "حل شده"
                      : issue.status === "in_progress"
                        ? "در پیگیری"
                        : "باز"
                  }
                  tone={
                    issue.priority === "urgent" && issue.status !== "resolved"
                      ? "red"
                      : "neutral"
                  }
                />
              </View>
              {issue.description ? (
                <Text style={styles.text}>{issue.description}</Text>
              ) : null}
              <Text style={styles.muted}>پیگیری با {issue.owner_name}</Text>
              {supervisor && issue.status !== "resolved" && (
                <Choices
                  values={[
                    { value: "in_progress", label: "در حال پیگیری" },
                    { value: "resolved", label: "حل شد" },
                  ]}
                  selected={issue.status}
                  select={(status) => {
                    if (!online || busy || status === issue.status) return;
                    run(`issue-${issue.id}`, async () => {
                      await fieldApi.mutate(
                        auth,
                        `/issues/${issue.id}`,
                        { status },
                        "PATCH",
                      );
                      notice("وضعیت مشکل ثبت شد.");
                      await refresh();
                    });
                  }}
                />
              )}
            </Card>
          ))
        ) : (
          <Card>
            <Text style={styles.muted}>مشکلی برای این شیفت ثبت نشده است.</Text>
          </Card>
        )}
      </Section>
      <Section title="گزارش پایان شیفت">
        {shift.ended_at && (
          <ShiftSummaryCard auth={auth} shiftId={shift.id} online={online} />
        )}
        <Card>
          {report ? (
            <>
              <Badge
                label={reportNames[report.status]}
                tone={report.status === "approved" ? "green" : "amber"}
              />
              <Text style={styles.text}>{report.summary}</Text>
              {report.feedback ? <Notice message={report.feedback} /> : null}
            </>
          ) : (
            <Text style={styles.muted}>
              بعد از ثبت عکس و خروج اعضای تیم، گزارش را ارسال کنید.
            </Text>
          )}
          {supervisor && !ended && now >= Date.parse(shift.starts_at) && (
            <Button
              label="پایان شیفت"
              icon="stop-circle-outline"
              onPress={confirmEnd}
              disabled={!online || !!busy}
              busy={busy === "end"}
            />
          )}
          {supervisor && pending && (
            <Button
              label="بررسی گزارش"
              icon="clipboard-check-outline"
              variant="dark"
              disabled={!online || !!busy}
              onPress={() => setForm(form === "review" ? null : "review")}
            />
          )}
          {!locked && (supervisor || !!attendance?.checked_out_at) && (
            <Button
              testID="report"
              label={report ? "اصلاح و ارسال مجدد" : "نوشتن گزارش"}
              icon="clipboard-text-outline"
              disabled={!online || !!busy}
              onPress={() => setForm(form === "report" ? null : "report")}
            />
          )}
        </Card>
      </Section>
    </View>
  );
}

function ShiftForm({
  auth,
  shift,
  form,
  report,
  online,
  busy,
  run,
  close,
  refresh,
  sync,
  notice,
}: {
  auth: Identity;
  shift: Shift;
  form: Form;
  report?: Report;
  online: boolean;
  busy: string | null;
  run: Run;
  close: () => void;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  notice: (value: string) => void;
}) {
  const [choice, setChoice] = useState<string>(
    form === "review"
      ? "approved"
      : form === "issue"
        ? "medium"
        : shift.received
          ? "distributed"
          : "initial",
  );
  const [title, setTitle] = useState("");
  const [text, setText] = useState(
    form === "report" ? (report?.summary ?? "") : "",
  );
  const [quantity, setQuantity] = useState("");
  const [photo, setPhoto] = useState<ImagePickerAsset | null>(null);
  const key = `form-${form}`;
  const titles = {
    stock: "ثبت گردش موجودی",
    issue: "ثبت مشکل",
    report: "گزارش اجرا",
    review: "تصمیم سرپرست",
    photo: "عکس شیفت",
  };
  const submit = () =>
    run(key, async () => {
      const path = `/shifts/${shift.id}`;
      if (form === "stock") {
        const clean = quantity
          .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 1776))
          .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 1632));
        const amount = Number(clean);
        if (
          !/^\d+$/.test(clean) ||
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > 1000000
        )
          throw new Error("تعداد باید عددی صحیح بین ۱ تا ۱٬۰۰۰٬۰۰۰ باشد.");
        await fieldApi.mutate(auth, `${path}/stock`, {
          kind: choice,
          quantity: amount,
          note: text.trim(),
        });
      } else if (form === "issue") {
        if (title.trim().length < 5)
          throw new Error("عنوان مشکل باید دست‌کم ۵ نویسه داشته باشد.");
        await fieldApi.mutate(auth, "/issues", {
          shift_id: shift.id,
          title: title.trim(),
          description: text.trim(),
          priority: choice,
        });
      } else if (form === "report") {
        if (text.trim().length < 10)
          throw new Error("خلاصه گزارش باید دست‌کم ۱۰ نویسه داشته باشد.");
        await sync();
        await fieldApi.mutate(auth, `${path}/report`, { summary: text.trim() });
      } else if (form === "review" && report) {
        if (choice === "returned" && text.trim().length < 5)
          throw new Error("دلیل بازگشت گزارش را بنویسید.");
        await fieldApi.mutate(auth, `/reports/${report.id}/review`, {
          status: choice,
          feedback: text.trim(),
        });
      } else if (form === "photo" && photo) {
        await enqueuePhoto(auth, shift.id, photo, text);
        close();
        notice("عکس روی دستگاه ذخیره و به صف ارسال اضافه شد.");
        await sync();
        return;
      }
      close();
      notice("تغییرات روی سرور ثبت شد.");
      await refresh();
    });
  return (
    <Section title={titles[form]}>
      <Card>
        {form === "stock" && (
          <>
            <Choices values={stockKinds} selected={choice} select={setChoice} />
            <Field
              label="تعداد"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              ltr
              testID="stock-quantity"
            />
          </>
        )}
        {form === "issue" && (
          <>
            <Field
              label="عنوان مشکل"
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />
            <Choices values={priorities} selected={choice} select={setChoice} />
          </>
        )}
        {form === "review" && (
          <Choices
            values={[
              { value: "approved", label: "تأیید نهایی" },
              { value: "returned", label: "بازگشت برای اصلاح" },
            ]}
            selected={choice}
            select={setChoice}
          />
        )}
        {form === "photo" && (
          <>
            {photo && (
              <Image
                source={{ uri: photo.uri }}
                style={local.photo}
                resizeMode="cover"
                accessibilityLabel="پیش‌نمایش تصویر انتخاب‌شده"
              />
            )}
            <Button
              label="گرفتن عکس"
              icon="camera-outline"
              onPress={() =>
                run("camera", async () => {
                  const asset = await pickPhoto(true);
                  if (asset) setPhoto(asset);
                })
              }
              disabled={!!busy}
            />
            <Button
              label="انتخاب از گالری"
              icon="image-outline"
              onPress={() =>
                run("photo-library", async () => {
                  const asset = await pickPhoto(false);
                  if (asset) setPhoto(asset);
                })
              }
              disabled={!!busy}
            />
          </>
        )}
        <Field
          label={
            form === "report"
              ? "خلاصه اجرا"
              : form === "review"
                ? "بازخورد"
                : "توضیحات"
          }
          value={text}
          onChangeText={setText}
          multiline
          maxLength={form === "stock" ? 1000 : form === "photo" ? 2000 : 5000}
        />
        <Button
          testID="save-shift-form"
          label={form === "photo" ? "ذخیره در صف ارسال" : "ثبت تغییرات"}
          icon="check"
          variant="dark"
          onPress={submit}
          disabled={!!busy || (form === "photo" ? !photo : !online)}
          busy={busy === key}
        />
        <Button label="انصراف" onPress={close} disabled={!!busy} />
      </Card>
    </Section>
  );
}

const local = StyleSheet.create({
  content: { gap: 16 },
  shiftCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    gap: 6,
  },
  shiftHeading: {
    backgroundColor: "#e9ede9",
    borderRadius: 17,
    padding: 16,
    gap: 8,
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: colors.line,
    marginVertical: 5,
  },
  breakRow: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f7f6ed",
    gap: 3,
  },
  link: { color: colors.green, fontWeight: "700", fontSize: 12 },
  metrics: { flexDirection: "row-reverse", gap: 8 },
  metric: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f2f5f1",
  },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  choices: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 9,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  choiceActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { color: colors.ink, fontSize: 13 },
  photo: {
    width: "100%",
    height: 190,
    borderRadius: 12,
    backgroundColor: colors.canvas,
  },
});
