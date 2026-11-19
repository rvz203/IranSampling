import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import { fieldApi, RequestError } from "./api";
import { ShiftCard } from "./ShiftScreen";
import {
  Badge,
  Button,
  Card,
  colors,
  day,
  Field,
  Icon,
  Notice,
  roleName,
  styles,
  time,
} from "./ui";
import type {
  Campaign,
  CampaignEvent,
  CampaignMessage,
  Identity,
  Shift,
} from "./types";

const statuses = {
  draft: "پیش‌نویس",
  scheduled: "برنامه‌ریزی‌شده",
  active: "در حال اجرا",
  paused: "متوقف‌شده",
  completed: "پایان‌یافته",
};

function messageError(error: unknown) {
  return error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد.";
}

export function CampaignList({
  campaigns,
  open,
}: {
  campaigns: Campaign[];
  open: (id: string) => void;
}) {
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        کمپین‌های شما
      </Text>
      {!campaigns.length ? (
        <Notice message="هنوز کمپینی به شیفت‌های شما اختصاص نیافته است." />
      ) : null}
      {campaigns.map((campaign) => (
        <Pressable
          accessibilityRole="button"
          key={campaign.id}
          onPress={() => open(campaign.id)}
          style={local.campaign}
        >
          <View style={local.icon}>
            <Icon name="bullhorn-outline" color={colors.green} />
          </View>
          <View style={local.grow}>
            <Text style={styles.name}>{campaign.name}</Text>
            <Text style={styles.muted}>{campaign.brand_name}</Text>
          </View>
          <Badge
            label={statuses[campaign.status]}
            tone={campaign.status === "active" ? "green" : "neutral"}
          />
        </Pressable>
      ))}
    </>
  );
}

export function CampaignRoom({
  auth,
  online,
  campaign,
  shifts,
  goBack,
  openShift,
  livePanel,
}: {
  auth: Identity;
  online: boolean;
  campaign: Campaign;
  shifts: Shift[];
  goBack: () => void;
  openShift: (id: string) => void;
  livePanel?: ReactNode;
}) {
  const [section, setSection] = useState("shifts");
  const sections = [
    { key: "shifts", label: "شیفت‌ها", icon: "calendar-clock" },
    { key: "chat", label: "گفت‌وگو", icon: "message-text-outline" },
    { key: "history", label: "تاریخچه", icon: "history" },
    ...(livePanel
      ? [
          {
            key: "team",
            label: "نقشه تیم",
            icon: "map-marker-radius-outline",
          } as const,
        ]
      : []),
  ] as const;
  return (
    <>
      <View style={styles.row}>
        <Button label="کمپین‌ها" icon="chevron-right" onPress={goBack} />
        <Badge
          label={statuses[campaign.status]}
          tone={campaign.status === "active" ? "green" : "neutral"}
        />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {campaign.name}
      </Text>
      <View style={local.sections}>
        {sections.map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: item.key === section }}
            key={item.key}
            onPress={() => setSection(item.key)}
            style={[local.section, item.key === section && local.selected]}
          >
            <Icon
              name={item.icon}
              size={17}
              color={item.key === section ? colors.white : colors.green}
            />
            <Text
              style={[
                local.sectionText,
                item.key === section && local.selectedText,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === "shifts" &&
        (shifts.length ? (
          shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onPress={() => openShift(shift.id)}
            />
          ))
        ) : (
          <Notice message="شیفت‌های این کمپین در تاریخچه قابل مشاهده‌اند." />
        ))}
      {section === "chat" && (
        <Conversation auth={auth} online={online} campaign={campaign.id} />
      )}
      {section === "history" && (
        <History auth={auth} online={online} campaign={campaign.id} />
      )}
      {section === "team" ? livePanel : null}
    </>
  );
}

function Conversation({
  auth,
  online,
  campaign,
}: {
  auth: Identity;
  online: boolean;
  campaign: string;
}) {
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [before, setBefore] = useState<number | null | undefined>();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const attempt = useRef<{ body: string; client_id: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);

  function merge(values: CampaignMessage[]) {
    setMessages((current) => {
      const byID = new Map(current.map((message) => [message.id, message]));
      values.forEach((message) => byID.set(message.id, message));
      return [...byID.values()].sort((a, b) => a.id - b.id);
    });
  }

  useEffect(() => {
    if (!online) return;
    let disposed = false;
    let pending = false;
    async function refresh() {
      if (pending || AppState.currentState !== "active") return;
      pending = true;
      try {
        const page = await fieldApi.campaignMessages(auth, campaign);
        if (disposed) return;
        merge(page.messages);
        setBefore((value) => (value === undefined ? page.next_before : value));
        setForbidden(false);
        setError("");
      } catch (problem) {
        if (disposed) return;
        if (problem instanceof RequestError && problem.status === 403) {
          setMessages([]);
          setBefore(undefined);
          setForbidden(true);
        }
        setError(messageError(problem));
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 4_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [auth, campaign, online]);

  async function send() {
    const body = draft.trim();
    if (!body || sending || !online || forbidden) return;
    if (attempt.current?.body !== body)
      attempt.current = { body, client_id: Crypto.randomUUID() };
    setSending(true);
    setSendError("");
    try {
      const message = await fieldApi.sendCampaignMessage(
        auth,
        campaign,
        attempt.current,
      );
      follow.current = true;
      merge([message]);
      setDraft("");
      attempt.current = null;
    } catch (problem) {
      setSendError(messageError(problem));
    } finally {
      setSending(false);
    }
  }

  async function older() {
    if (!before || loadingOlder || !online) return;
    setLoadingOlder(true);
    try {
      const page = await fieldApi.campaignMessages(auth, campaign, before);
      follow.current = false;
      merge(page.messages);
      setBefore(page.next_before);
    } catch (problem) {
      setError(messageError(problem));
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <Card>
      {before ? (
        <Button
          label="پیام‌های قدیمی‌تر"
          icon="history"
          busy={loadingOlder}
          disabled={!online}
          onPress={() => void older()}
        />
      ) : null}
      <ScrollView
        ref={scroll}
        style={local.chat}
        contentContainerStyle={local.chatContent}
        nestedScrollEnabled
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          follow.current =
            nativeEvent.contentSize.height -
              nativeEvent.layoutMeasurement.height -
              nativeEvent.contentOffset.y <
            42;
        }}
        onContentSizeChange={() => {
          if (follow.current) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {!messages.length && !error ? (
          <Text style={styles.muted}>
            {before === undefined && online
              ? "در حال دریافت پیام‌ها…"
              : "پیامی برای نمایش وجود ندارد."}
          </Text>
        ) : null}
        {messages.map((message) => (
          <View
            style={[
              local.bubble,
              message.sender_id === auth.user.id && local.mine,
            ]}
            key={message.id}
          >
            <Text style={styles.name}>{message.sender_name}</Text>
            <Text style={styles.muted}>
              {message.sender_role === "admin"
                ? "ادمین"
                : message.sender_role === "manager"
                  ? "مدیر عملیات"
                  : roleName(message.sender_role as Identity["user"]["role"])}
            </Text>
            <Text selectable style={styles.text}>
              {message.body}
            </Text>
            <Text style={styles.muted}>
              {day(message.created_at)} · {time(message.created_at)}
            </Text>
          </View>
        ))}
      </ScrollView>
      {!online ? (
        <Notice message="برای دریافت و ارسال پیام به اینترنت وصل شوید." />
      ) : null}
      {error ? <Notice error message={error} /> : null}
      {sendError ? <Notice error message={sendError} /> : null}
      {!forbidden && (
        <>
          <Field
            label="پیام شما"
            multiline
            value={draft}
            onChangeText={setDraft}
            maxLength={2000}
            editable={!sending}
            placeholder="برای تیم این کمپین بنویسید…"
          />
          <Button
            label="ارسال پیام"
            icon="send-outline"
            variant="dark"
            busy={sending}
            disabled={!online || !draft.trim()}
            onPress={() => void send()}
            testID="campaign-send-message"
          />
        </>
      )}
    </Card>
  );
}

function History({
  auth,
  online,
  campaign,
}: {
  auth: Identity;
  online: boolean;
  campaign: string;
}) {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [before, setBefore] = useState<string | null | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!online) return;
    let active = true;
    void fieldApi
      .campaignHistory(auth, campaign)
      .then((page) => {
        if (!active) return;
        setEvents(page.events);
        setBefore(page.next_before);
        setError("");
      })
      .catch((problem) => {
        if (!active) return;
        if (problem instanceof RequestError && problem.status === 403) {
          setEvents([]);
          setBefore(undefined);
        }
        setError(messageError(problem));
      });
    return () => {
      active = false;
    };
  }, [auth, campaign, online, reload]);

  async function older() {
    if (!before || !online || loading) return;
    setLoading(true);
    try {
      const page = await fieldApi.campaignHistory(auth, campaign, before);
      setEvents((current) => [...current, ...page.events]);
      setBefore(page.next_before);
    } catch (problem) {
      setError(messageError(problem));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      {!online ? (
        <Notice message="برای دریافت تاریخچه به اینترنت وصل شوید." />
      ) : null}
      {error ? (
        <>
          <Notice error message={error} />
          <Button
            label="تلاش دوباره"
            icon="refresh"
            disabled={!online}
            onPress={() => setReload((value) => value + 1)}
          />
        </>
      ) : null}
      {!error && !events.length && online && (
        <Text style={styles.muted}>
          {before === undefined
            ? "در حال دریافت تاریخچه…"
            : "رویدادی ثبت نشده است."}
        </Text>
      )}
      {events.map((event) => (
        <View key={event.id} style={local.event}>
          <View style={local.icon}>
            <Icon name="clock-outline" color={colors.green} size={18} />
          </View>
          <View style={local.grow}>
            <Text style={styles.text}>{event.detail}</Text>
            <Text style={styles.muted}>
              {event.actor_name}
              {event.location_name ? ` · ${event.location_name}` : ""}
            </Text>
            <Text style={styles.muted}>
              {day(event.created_at)} · {time(event.created_at)}
            </Text>
          </View>
        </View>
      ))}
      {before ? (
        <Button
          label="رویدادهای قدیمی‌تر"
          icon="history"
          busy={loading}
          disabled={!online}
          onPress={() => void older()}
        />
      ) : null}
    </Card>
  );
}

const local = StyleSheet.create({
  campaign: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    minHeight: 66,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.greenWash,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1, gap: 2 },
  sections: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    padding: 4,
    gap: 5,
    borderRadius: 12,
    backgroundColor: colors.greenWash,
  },
  section: {
    flex: 1,
    minWidth: 70,
    minHeight: 49,
    gap: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 3,
  },
  sectionText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  selected: { backgroundColor: colors.dark },
  selectedText: { color: colors.white },
  chat: {
    maxHeight: 350,
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: colors.canvas,
  },
  chatContent: { padding: 10, gap: 9 },
  bubble: {
    alignSelf: "flex-end",
    padding: 10,
    gap: 3,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    maxWidth: "90%",
  },
  mine: { alignSelf: "flex-start", backgroundColor: colors.greenWash },
  event: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingBottom: 10,
  },
});
