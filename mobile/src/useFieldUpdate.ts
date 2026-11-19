import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { colors } from "./ui";
import {
  createUpdateFlow,
  UPDATE_CHECK_INTERVAL,
  type UpdatePhase,
} from "./update-flow";

const updatesEnabled = !__DEV__ && Updates.isEnabled;

export function useFieldUpdate(canReload: boolean) {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [reduceMotion, setReduceMotion] = useState(true);
  const preferences = useRef({ canReload, reduceMotion });
  const { downloadProgress } = Updates.useUpdates();

  useLayoutEffect(() => {
    preferences.current = { canReload, reduceMotion };
    return () => {
      preferences.current.canReload = false;
    };
  }, [canReload, reduceMotion]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const [flow] = useState(() =>
    createUpdateFlow(
      {
        enabled: updatesEnabled,
        check: async () => {
          const result = await Updates.checkForUpdateAsync();
          return result.isAvailable || result.isRollBackToEmbedded;
        },
        download: async () => {
          const result = await Updates.fetchUpdateAsync();
          return result.isNew || result.isRollBackToEmbedded;
        },
        reload: () =>
          Updates.reloadAsync({
            reloadScreenOptions: {
              backgroundColor: colors.dark,
              image: require("../assets/icon.png"),
              imageResizeMode: "center",
              fade: !preferences.current.reduceMotion,
              spinner: {
                enabled: true,
                size: "small",
                color: colors.greenWash,
              },
            },
          }),
      },
      setPhase,
    ),
  );

  useEffect(() => {
    if (!updatesEnabled) return;
    let connected: boolean | null = null;
    let justReconnected = false;
    const check = () => {
      if (AppState.currentState !== "active" || connected === false) return;
      void flow.check(justReconnected ? "reconnected" : "scheduled");
      justReconnected = false;
    };
    const appState = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state === "active") check();
    });
    const network = NetInfo.addEventListener(({ isConnected }) => {
      if (connected === false && isConnected === true) justReconnected = true;
      connected = isConnected;
      check();
    });
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL);
    check();
    return () => {
      clearInterval(interval);
      appState.remove();
      network();
    };
  }, [flow]);

  const apply = useCallback(() => {
    void flow.apply(
      () => preferences.current.canReload && AppState.currentState === "active",
      () => new Promise<void>((resolve) => setTimeout(resolve, 420)),
    );
  }, [flow]);

  useEffect(() => {
    if (phase === "ready" && foreground && canReload) apply();
  }, [apply, canReload, foreground, phase]);

  return {
    phase,
    progress: downloadProgress,
    version: Constants.nativeAppVersion ?? Constants.expoConfig?.version,
    reduceMotion,
    canReload,
    check: () => void flow.check("manual"),
    apply,
  };
}

export type FieldUpdate = ReturnType<typeof useFieldUpdate>;
