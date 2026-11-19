import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export const colors = {
  ink: "#101513",
  sub: "#536059",
  canvas: "#f4f5f1",
  white: "#ffffff",
  line: "#dbe1dc",
  dark: "#151c19",
  green: "#17634b",
  greenWash: "#e0f1e7",
  amber: "#7e4b1e",
  amberWash: "#fff1dd",
  red: "#9a312a",
  redWash: "#fff1ef",
};

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export function Icon({
  name,
  size = 21,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function Button({
  label,
  icon,
  onPress,
  variant = "light",
  disabled,
  busy,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: "dark" | "light" | "danger";
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const dark = variant === "dark";
  const color = dark
    ? colors.white
    : variant === "danger"
      ? colors.red
      : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        dark && styles.buttonDark,
        variant === "danger" && styles.buttonDanger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : icon ? (
        <Icon name={icon} size={19} color={color} />
      ) : null}
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  ltr,
  ...props
}: TextInputProps & { label: string; ltr?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#727e75"
        selectionColor={colors.green}
        {...props}
        style={[
          styles.input,
          ltr && styles.ltr,
          props.multiline && styles.textArea,
          props.style,
        ]}
      />
    </View>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const backgroundColor =
    tone === "green"
      ? colors.greenWash
      : tone === "amber"
        ? colors.amberWash
        : tone === "red"
          ? colors.redWash
          : "#edf0ed";
  const color =
    tone === "green"
      ? colors.green
      : tone === "amber"
        ? colors.amber
        : tone === "red"
          ? colors.red
          : colors.sub;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : "text"}
      style={[styles.notice, error && styles.noticeError]}
    >
      <Icon
        name={error ? "alert-circle-outline" : "information-outline"}
        color={error ? colors.red : colors.green}
      />
      <Text style={[styles.noticeText, error && { color: colors.red }]}>
        {message}
      </Text>
    </View>
  );
}

export const num = (value: number) =>
  new Intl.NumberFormat("fa-IR").format(value);
export const time = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
export const day = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
export const roleName = (role: string) =>
  role === "supervisor" ? "سرپرست" : "سمپلر";

export const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonDark: { backgroundColor: colors.dark, borderColor: colors.dark },
  buttonDanger: { borderColor: "#f0d5d2", backgroundColor: colors.redWash },
  buttonLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
  field: { gap: 6 },
  fieldLabel: {
    textAlign: "right",
    color: colors.sub,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#f8f9f7",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 15,
    textAlign: "right",
  },
  textArea: { minHeight: 94, textAlignVertical: "top" },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  section: { gap: 10 },
  sectionTitle: {
    textAlign: "right",
    color: colors.ink,
    fontWeight: "800",
    fontSize: 18,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    gap: 12,
  },
  badge: {
    minHeight: 27,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 7,
    flexDirection: "row-reverse",
    gap: 5,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  badgeLabel: { fontSize: 11, fontWeight: "700" },
  dot: { height: 6, width: 6, borderRadius: 3 },
  notice: {
    padding: 12,
    backgroundColor: colors.greenWash,
    borderRadius: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  noticeError: { backgroundColor: colors.redWash },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.green,
    textAlign: "right",
    lineHeight: 21,
  },
  text: { textAlign: "right", color: colors.ink, fontSize: 15, lineHeight: 24 },
  muted: {
    textAlign: "right",
    color: colors.sub,
    fontSize: 13,
    lineHeight: 21,
  },
  title: {
    textAlign: "right",
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 42,
  },
  name: {
    textAlign: "right",
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 25,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stack: { gap: 10 },
});
