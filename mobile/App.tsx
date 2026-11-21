import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fieldApi, RequestError, signIn } from "./src/api";
import { parseOrigin } from "./src/origin";
import {
  LOCATION_PERIOD_MS,
  nextTrackingBoundary,
  trackingPhase,
} from "./src/location-policy";
import { flushOutbox } from "./src/outbox";
import { ShiftCard, ShiftScreen } from "./src/ShiftScreen";
import {
  clearIdentity,
  loadIdentity,
  saveIdentity,
  storage,
} from "./src/storage";
import {
  beginSharing,
  collectForeground,
  reconcileTracking,
  stopSharing,
} from "./src/tracking";
import {
  Badge,
  Button,
  Card,
  colors,
  Field,
  Icon,
  Notice,
  num,
  roleName,
  Section,
  styles,
  time,
} from "./src/ui";
import {
  accountKey,
  type Identity,
  type LivePoint,
  type OutboxItem,
  type TrackingState,
  type Workspace,
} from "./src/types";
import {
  CheckUpdateButton,
  UpdateInstallation,
  UpdatePanel,
} from "./src/UpdatePanel";
import { useFieldUpdate, type FieldUpdate } from "./src/useFieldUpdate";
import { CampaignList, CampaignRoom } from "./src/CampaignRoom";
import { IranMap, IranMapDetail } from "./src/IranMap";

const emptyCounts = { pending: 0, rejected: 0, photos: 0 };
const localBuild = !!Constants.expoConfig?.extra?.localBuild;
const defaultOrigin =
  process.env.EXPO_PUBLIC_API_ORIGIN ||
  (localBuild
    ? Platform.OS === "android"
      ? "http://10.0.2.2:8080"
      : "http://127.0.0.1:8080"
    : "");
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "این عملیات انجام نشد. دوباره تلاش کنید.";
type Tab = "shifts" | "campaigns" | "live" | "queue";

function Login({
  bootError,
  onLogin,
  onEditingChange,
  update,
}: {
  bootError: string;
  onLogin: (auth: Identity) => void;
  onEditingChange: (editing: boolean) => void;
  update: FieldUpdate;
}) {
  const [origin, setOrigin] = useState(defaultOrigin);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onEditingChange(
      busy || origin !== defaultOrigin || !!identifier || !!password,
    );
  }, [busy, identifier, onEditingChange, origin, password]);

  const submit = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const apiOrigin = parseOrigin(origin, localBuild);
      const auth = await signIn(apiOrigin, identifier, password);
      await saveIdentity(auth);
      setPassword("");
      onLogin(auth);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={local.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={local.login}
      >
        <View style={local.loginHero}>
          <Image
            source={require("./assets/field-kit.jpg")}
            style={local.loginPhoto}
            resizeMode="cover"
            accessible={false}
          />
          <View style={local.loginHeroText}>
            <Image
              source={require("./assets/icon.png")}
              style={local.logo}
              accessible={false}
            />
            <Text accessibilityRole="header" style={styles.title}>
              ایران سمپلینگ
            </Text>
            <Text style={styles.muted}>اپ میدانی سرپرست و سمپلر</Text>
          </View>
        </View>
        <UpdatePanel update={update} />
        <Card>
          <Text accessibilityRole="header" style={styles.name}>
            ورود به حساب کاری
          </Text>
          <Field
            label="نشانی سرور"
            ltr
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={origin}
            onChangeText={setOrigin}
            placeholder="https://sampling.example.com"
            testID="server-origin"
          />
          <Field
            label="نام کاربری یا ایمیل"
            ltr
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            value={identifier}
            onChangeText={setIdentifier}
            testID="username"
          />
          <Field
            label="رمز عبور"
            ltr
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            testID="password"
            onSubmitEditing={() => {
              if (origin && identifier && password) void submit();
            }}
          />
          {error || bootError ? (
            <Notice error message={error || bootError} />
          ) : null}
          <Button
            testID="sign-in"
            label="ورود به شیفت‌ها"
            icon="login"
            variant="dark"
            busy={busy}
            disabled={!origin.trim() || !identifier.trim() || !password}
            onPress={() => void submit()}
          />
          <Text style={styles.muted}>
            از نام کاربری یا ایمیل و رمزی استفاده کنید که ادمین برای شما تعیین
            کرده است.
          </Text>
        </Card>
        <CheckUpdateButton update={update} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LiveTeam({
  auth,
  active,
  campaign,
  mapAvailable,
}: {
  auth: Identity;
  active: boolean;
  campaign?: string;
  mapAvailable?: boolean;
}) {
  const [data, setData] = useState<{
    points: LivePoint[];
    server_time: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await fieldApi.live(auth, campaign));
      setError("");
    } catch (error) {
      setData(null);
      setError(errorText(error));
    }
  }, [auth, campaign]);
  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 15_000);
    return () => clearInterval(timer);
  }, [active, load]);
  const serverTime = data ? Date.parse(data.server_time) : Date.now();
  const isFresh = (point: LivePoint) =>
    !!point.captured_at && serverTime - Date.parse(point.captured_at) <= 90_000;
  const points = (data?.points ?? []).flatMap((point) => {
    if (point.latitude == null || point.longitude == null) return [];
    return [
      {
        id: `${point.shift_id}:${point.person_id}`,
        label: point.person_name,
        latitude: point.latitude,
        longitude: point.longitude,
        stale: !isFresh(point),
      },
    ];
  });
  const focused = points.find((point) => point.id === selected);
  return (
    <Section title="موقعیت زنده تیم">
      {error && <Notice error message={error} />}
      <Button
        label="تازه‌سازی موقعیت‌ها"
        icon="refresh"
        onPress={() => void load()}
      />
      {mapAvailable && points.length > 0 && (
        <IranMap origin={auth.origin} points={points} />
      )}
      {mapAvailable && focused ? (
        <IranMapDetail
          origin={auth.origin}
          point={focused}
          close={() => setSelected(null)}
        />
      ) : null}
      {data && data.points.length === 0 && (
        <Card>
          <Text style={styles.text}>
            در شیفت‌های شما فعلاً کسی موقعیتش را به اشتراک نگذاشته است.
          </Text>
        </Card>
      )}
      {data?.points.map((point) => {
        const fresh = isFresh(point);
        return (
          <Card key={`${point.shift_id}:${point.person_id}`}>
            <View style={styles.row}>
              <Text style={[styles.name, { flex: 1 }]}>
                {point.person_name}
              </Text>
              <Badge
                label={
                  point.state === "break"
                    ? "استراحت"
                    : point.state === "before_work"
                      ? "پیش از شروع کار"
                      : fresh
                        ? "به‌روز"
                        : point.captured_at
                          ? "آخرین موقعیت"
                          : "منتظر اولین نمونه"
                }
                tone={fresh ? "green" : "amber"}
              />
            </View>
            <Text style={styles.muted}>
              {roleName(point.role)} · {point.location_name}
            </Text>
            {point.captured_at && (
              <Text style={styles.text}>
                ثبت {time(point.captured_at)} · دقت{" "}
                {num(Math.round(point.accuracy ?? 0))} متر
              </Text>
            )}
            {mapAvailable &&
              point.latitude != null &&
              point.longitude != null && (
                <Button
                  label="باز کردن نقشه"
                  icon="map-marker-outline"
                  onPress={() =>
                    setSelected(`${point.shift_id}:${point.person_id}`)
                  }
                />
              )}
          </Card>
        );
      })}
    </Section>
  );
}

function FieldApp() {
  const [auth, setAuth] = useState<Identity | null>(null);
  const authRef = useRef<Identity | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bootError, setBootError] = useState("");
  const [data, setData] = useState<Workspace | null>(null);
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [track, setTrack] = useState<TrackingState | null>();
  const [loginEditing, setLoginEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("shifts");
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [counts, setCounts] = useState(emptyCounts);
  const [entries, setEntries] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const collecting = useRef(false);
  const pollTracking = useRef<() => void>(() => {});
  const scroll = useRef<ScrollView>(null);
  const update = useFieldUpdate(
    loaded &&
      (auth
        ? track === null && !shiftId && !campaignId && !busy && !refreshing
        : !loginEditing),
  );

  const useAccount = useCallback((next: Identity | null) => {
    authRef.current = next;
    setAuth(next);
    setData(null);
    setTrack(undefined);
    setLoginEditing(false);
    setEntries([]);
    setCounts(emptyCounts);
    setTab("shifts");
    setShiftId(null);
    setCampaignId(null);
    setOnline(false);
    setProblem("");
    setNotice("");
  }, []);

  const expire = useCallback(
    async (account: Identity) => {
      if (authRef.current !== account) return;
      await stopSharing(account, false).catch(() => {});
      await clearIdentity().catch(() => {});
      useAccount(null);
      setBootError(
        "نشست پایان یافته است. دوباره با همین حساب وارد شوید تا صف ارسال ادامه پیدا کند.",
      );
    },
    [useAccount],
  );

  useEffect(() => {
    void loadIdentity()
      .then(async (current) => {
        if (!current) return;
        if (Date.parse(current.expiresAt) <= Date.now()) {
          await stopSharing(current, false).catch(() => {});
          await clearIdentity();
          setBootError("برای ادامه کار دوباره وارد شوید.");
          return;
        }
        useAccount(current);
      })
      .catch(() =>
        setBootError("اطلاعات ورود از دستگاه خوانده نشد. دوباره وارد شوید."),
      )
      .finally(() => setLoaded(true));
  }, [useAccount]);

  const snapshot = useCallback(async (account: Identity) => {
    const [active, summary, pending] = await Promise.all([
      reconcileTracking(account),
      storage.counts(account),
      storage.entries(account),
    ]);
    if (authRef.current === account) {
      setTrack(active);
      setCounts(summary);
      setEntries(pending);
    }
  }, []);

  const refresh = useCallback(async () => {
    const account = authRef.current;
    if (!account || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const next = await fieldApi.workspace(account);
      if (authRef.current !== account) return;
      setData(next);
      setOnline(true);
      await storage
        .cache(account, next)
        .catch(() =>
          setProblem("ذخیره نسخه آفلاین شیفت‌ها روی دستگاه انجام نشد."),
        );
      const active = await storage.tracking(account);
      if (
        active &&
        !next.attendance.some(
          (a) =>
            a.shift_id === active.shift_id &&
            a.person_id === account.user.id &&
            !a.checked_out_at,
        )
      )
        await stopSharing(account, false);
    } catch (error) {
      if (authRef.current !== account) return;
      if (error instanceof RequestError && error.status === 401)
        await expire(account);
      else setOnline(false);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [expire]);

  const sync = useCallback(
    async (force = false) => {
      const account = authRef.current;
      if (!account) return;
      const result = await flushOutbox(account, { photos: true, force });
      if (authRef.current !== account) return;
      if (result === "reauthenticate") {
        await expire(account);
        return;
      }
      await snapshot(account);
      if (result === "done") await refresh();
      if (force && result === "retry")
        setProblem("ارسال موقتاً ممکن نبود. داده‌ها در صف باقی ماندند.");
    },
    [expire, refresh, snapshot],
  );

  useEffect(() => {
    if (!auth) return;
    let disposed = false;
    void storage
      .cached(auth)
      .then((cached) => {
        if (!disposed && authRef.current === auth && cached)
          setData((current) => current ?? cached.data);
      })
      .catch(() => {});
    const update = () => void snapshot(auth).catch(() => {});
    const send = (force = false) =>
      void sync(force).catch((error) => {
        if (!disposed) setProblem(errorText(error));
      });
    const poll = () => {
      if (disposed || AppState.currentState !== "active") return;
      if (!collecting.current) {
        collecting.current = true;
        void collectForeground(auth)
          .catch(() => {})
          .finally(() => {
            collecting.current = false;
            update();
            send();
          });
      }
      void refresh();
    };
    pollTracking.current = poll;
    poll();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") poll();
    });
    const network = NetInfo.addEventListener((state) => {
      if (disposed) return;
      if (state.isConnected === false) setOnline(false);
      else if (state.isConnected && AppState.currentState === "active") {
        void refresh();
        send();
      }
    });
    const timer = setInterval(poll, LOCATION_PERIOD_MS);
    return () => {
      disposed = true;
      pollTracking.current = () => {};
      clearInterval(timer);
      network();
      listener.remove();
    };
  }, [auth, refresh, snapshot, sync]);

  useEffect(() => {
    if (!track) return;
    const now = Date.now();
    const boundary = nextTrackingBoundary(track, now);
    if (boundary == null) return;
    const timer = setTimeout(() => pollTracking.current(), boundary - now + 10);
    return () => clearTimeout(timer);
  }, [track]);

  const run = (key: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setProblem("");
    setNotice("");
    void action()
      .catch(async (error) => {
        const current = authRef.current;
        if (current && error instanceof RequestError && error.status === 401)
          await expire(current);
        else setProblem(errorText(error));
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(null);
      });
  };

  const jump = (next: Tab) => {
    setTab(next);
    setShiftId(null);
    setCampaignId(null);
    setProblem("");
    setNotice("");
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const signOut = (account: Identity) =>
    Alert.alert(
      "خروج از حساب",
      "اشتراک این دستگاه متوقف می‌شود. موارد صف فقط پس از ورود دوباره با همین حساب ارسال می‌شوند.",
      [
        { text: "انصراف", style: "cancel" },
        {
          text: "خروج",
          style: "destructive",
          onPress: () =>
            run("logout", async () => {
              await stopSharing(account, false);
              await flushOutbox(account).catch(() => {});
              await fieldApi.logout(account).catch(() => {});
              await clearIdentity();
              setBootError("");
              useAccount(null);
            }),
        },
      ],
    );

  if (!loaded)
    return (
      <View style={local.center}>
        <ActivityIndicator color={colors.green} size="large" />
        <Text style={styles.muted}>در حال آماده‌سازی حساب کاری</Text>
      </View>
    );
  if (!auth)
    return (
      <>
        <Login
          bootError={bootError}
          onEditingChange={setLoginEditing}
          update={update}
          onLogin={(account) => {
            setBootError("");
            useAccount(account);
          }}
        />
        <UpdateInstallation update={update} />
      </>
    );
  const selected = data?.shifts.find((shift) => shift.id === shiftId);
  const campaign = data?.campaigns?.find((item) => item.id === campaignId);
  const ordered = [...(data?.shifts ?? [])].sort((a, b) => {
    const rank = { active: 0, scheduled: 1, completed: 2 };
    return (
      (a.ended_at ? rank.completed : rank[a.status]) -
        (b.ended_at ? rank.completed : rank[b.status]) ||
      Date.parse(b.starts_at) - Date.parse(a.starts_at)
    );
  });
  const tabs: {
    key: Tab;
    name: string;
    icon:
      | "calendar-clock"
      | "bullhorn-outline"
      | "map-marker-radius-outline"
      | "cloud-upload-outline";
  }[] = [
    { key: "shifts", name: "شیفت‌ها", icon: "calendar-clock" },
    { key: "campaigns", name: "کمپین‌ها", icon: "bullhorn-outline" },
    ...(auth.user.role === "supervisor"
      ? [
          {
            key: "live" as const,
            name: "موقعیت تیم",
            icon: "map-marker-radius-outline" as const,
          },
        ]
      : []),
    {
      key: "queue",
      name: `صف ارسال${counts.pending ? ` (${num(counts.pending)})` : ""}`,
      icon: "cloud-upload-outline",
    },
  ];
  const stop = async () => {
    await stopSharing(auth, false);
    await snapshot(auth);
    setNotice("ثبت موقعیت روی دستگاه متوقف شد.");
    await sync();
  };
  const phase = track && trackingPhase(track, Date.now() + track.clockOffset);
  return (
    <>
      <View style={local.header}>
        <View style={styles.row}>
          <View style={local.profile}>
            <Image
              source={require("./assets/icon.png")}
              style={local.logoSmall}
              accessible={false}
            />
            <View style={local.profileCopy}>
              <Text style={styles.name}>{auth.user.name}</Text>
              <Text style={styles.muted}>{roleName(auth.user.role)}</Text>
            </View>
          </View>
          <Button
            label="خروج"
            icon="logout"
            onPress={() => signOut(auth)}
            disabled={!!busy}
            testID="sign-out"
          />
        </View>
        <View style={styles.row}>
          <Badge
            label={online ? "متصل به سرور" : "آفلاین"}
            tone={online ? "green" : "amber"}
          />
          {track && (
            <Pressable accessibilityRole="button" onPress={() => jump("queue")}>
              <Badge
                label={
                  phase === "break"
                    ? "توقف در استراحت"
                    : phase === "before_work"
                      ? "در انتظار شروع کار"
                      : phase === "ended"
                        ? "اشتراک پایان یافت"
                        : "اشتراک موقعیت فعال"
                }
                tone={phase === "working" ? "green" : "neutral"}
              />
            </Pressable>
          )}
        </View>
        {problem ? (
          <Notice error message={problem} />
        ) : notice ? (
          <Notice message={notice} />
        ) : null}
      </View>
      <KeyboardAvoidingView
        style={local.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          key={selected?.id ?? campaign?.id ?? tab}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={local.body}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                void sync(true).catch((error) => setProblem(errorText(error)))
              }
            />
          }
        >
          <UpdatePanel update={update} />
          {!online && (
            <Notice message="نمایش اطلاعات ذخیره‌شده. موقعیت و عکس پس از اتصال ارسال می‌شوند." />
          )}
          {selected && data ? (
            <ShiftScreen
              key={selected.id}
              auth={auth}
              data={data}
              shift={selected}
              online={online}
              track={track ?? null}
              busy={busy}
              run={run}
              refresh={refresh}
              sync={() => sync(true)}
              share={async (id) => {
                await beginSharing(auth, id);
                await snapshot(auth);
                setNotice("اشتراک موقعیت این شیفت فعال شد.");
                void collectForeground(auth)
                  .then(() => sync())
                  .catch(() => {});
              }}
              stop={stop}
              notice={setNotice}
              onBack={() => setShiftId(null)}
            />
          ) : tab === "shifts" ? (
            <>
              <View style={local.hero}>
                <Image
                  source={require("./assets/field-kit.jpg")}
                  style={local.heroImage}
                  resizeMode="cover"
                  accessible={false}
                />
                <View style={local.heroCopy}>
                  <Text accessibilityRole="header" style={styles.title}>
                    شیفت‌های شما
                  </Text>
                  <Text style={styles.muted}>
                    ورود، توزیع، عکس و گزارش هر اجرا
                  </Text>
                </View>
              </View>
              {ordered.length ? (
                ordered.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    onPress={() => {
                      setShiftId(shift.id);
                      setProblem("");
                      setNotice("");
                    }}
                  />
                ))
              ) : (
                <Card>
                  <Text style={styles.text}>
                    {data
                      ? "شیفتی به شما اختصاص داده نشده است."
                      : "به سرور وصل شوید تا شیفت‌ها دریافت شوند."}
                  </Text>
                  <Button
                    label="دریافت شیفت‌ها"
                    icon="refresh"
                    onPress={() => void refresh()}
                  />
                </Card>
              )}
            </>
          ) : tab === "campaigns" ? (
            campaign ? (
              <CampaignRoom
                key={campaign.id}
                auth={auth}
                online={online}
                campaign={campaign}
                shifts={ordered.filter(
                  (shift) => shift.campaign_id === campaign.id,
                )}
                goBack={() => setCampaignId(null)}
                openShift={setShiftId}
                livePanel={
                  auth.user.role === "supervisor" ? (
                    <LiveTeam
                      auth={auth}
                      active={online}
                      mapAvailable={data?.map_available}
                      campaign={campaign.id}
                    />
                  ) : undefined
                }
              />
            ) : (
              <CampaignList
                campaigns={data?.campaigns ?? []}
                open={setCampaignId}
              />
            )
          ) : tab === "live" && auth.user.role === "supervisor" ? (
            <LiveTeam
              auth={auth}
              active={online}
              mapAvailable={data?.map_available}
            />
          ) : (
            <Section title="صف ارسال">
              <Card>
                <View style={styles.row}>
                  <Text style={styles.text}>
                    {num(counts.pending)} مورد در انتظار
                  </Text>
                  <Badge
                    label={`${num(counts.rejected)} نیازمند بررسی`}
                    tone={counts.rejected > 0 ? "amber" : "neutral"}
                  />
                </View>
                {counts.photos > 0 && (
                  <Text style={styles.muted}>
                    {num(counts.photos)} عکس ذخیره‌شده در صف
                  </Text>
                )}
                <Button
                  testID="sync-now"
                  label="همگام‌سازی اکنون"
                  icon="sync"
                  variant="dark"
                  busy={busy === "sync"}
                  disabled={!!busy}
                  onPress={() => run("sync", () => sync(true))}
                />
                {track && (
                  <Button
                    label="توقف اشتراک این شیفت"
                    icon="stop-circle-outline"
                    variant="danger"
                    disabled={!!busy}
                    onPress={() => run("stop", stop)}
                  />
                )}
              </Card>
              {entries.map((item) => (
                <Card key={item.id}>
                  <View style={styles.row}>
                    <Text style={styles.name}>
                      {item.payload.kind === "photo"
                        ? "عکس اجرا"
                        : item.payload.kind === "fix"
                          ? "نمونه موقعیت"
                          : "توقف اشتراک"}
                    </Text>
                    <Badge
                      label={item.rejected ? "رد شده" : "در صف"}
                      tone={item.rejected ? "red" : "amber"}
                    />
                  </View>
                  <Text style={styles.muted}>
                    {time(new Date(item.createdAt).toISOString())}
                    {item.error ? ` · ${item.error}` : ""}
                  </Text>
                  {item.payload.kind === "photo" && (
                    <Image
                      source={{ uri: item.payload.uri }}
                      style={local.queuedPhoto}
                      accessibilityLabel="عکس در صف"
                    />
                  )}
                  {item.rejected && (
                    <Button
                      label="حذف مورد رد شده"
                      variant="danger"
                      onPress={() =>
                        Alert.alert(
                          "حذف از صف",
                          "این مورد از حافظه اپ پاک می‌شود.",
                          [
                            { text: "انصراف", style: "cancel" },
                            {
                              text: "حذف",
                              style: "destructive",
                              onPress: () =>
                                run("discard", async () => {
                                  await storage.remove(auth, item);
                                  await snapshot(auth);
                                }),
                            },
                          ],
                        )
                      }
                    />
                  )}
                </Card>
              ))}
              {!entries.length && (
                <Card>
                  <Text style={styles.muted}>
                    داده‌ای برای ارسال در صف نیست.
                  </Text>
                </Card>
              )}
            </Section>
          )}
          {!selected ? <CheckUpdateButton update={update} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={local.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            testID={`tab-${item.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.key }}
            onPress={() => jump(item.key)}
            style={[local.tab, tab === item.key && local.tabActive]}
          >
            <Icon
              name={item.icon}
              color={tab === item.key ? colors.green : colors.sub}
            />
            <Text
              style={[
                local.tabLabel,
                tab === item.key && { color: colors.green },
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <UpdateInstallation update={update} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={local.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
        <FieldApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  login: {
    width: "100%",
    maxWidth: 570,
    alignSelf: "center",
    padding: 16,
    gap: 15,
    paddingBottom: 28,
  },
  loginHero: {
    overflow: "hidden",
    borderRadius: 17,
    backgroundColor: "#e9ece7",
  },
  loginPhoto: { width: "100%", height: 182 },
  loginHeroText: { padding: 14, alignItems: "flex-end", gap: 2 },
  logo: { borderRadius: 11, width: 44, height: 44 },
  logoSmall: { borderRadius: 8, width: 38, height: 38 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  profile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  profileCopy: { flexShrink: 1 },
  body: {
    width: "100%",
    maxWidth: 770,
    alignSelf: "center",
    gap: 14,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  hero: { overflow: "hidden", borderRadius: 16, backgroundColor: "#e9ede9" },
  heroImage: { width: "100%", height: 116 },
  heroCopy: { paddingHorizontal: 15, paddingTop: 5, paddingBottom: 13 },
  tabs: {
    flexDirection: "row-reverse",
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    gap: 4,
  },
  tabActive: { backgroundColor: colors.greenWash },
  tabLabel: { fontSize: 12, fontWeight: "700", color: colors.sub },
  queuedPhoto: { height: 128, width: "100%", borderRadius: 10 },
});
