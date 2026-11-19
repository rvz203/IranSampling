import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, slug } = config;
  if (!name || !slug)
    throw new Error("Set the Expo app name and slug in app.json.");
  const localBuild = process.env.SAMPLING_LOCAL_BUILD === "1";
  const projectId =
    process.env.SAMPLING_EAS_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  if (
    projectId &&
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(projectId)
  ) {
    throw new Error(
      "Set SAMPLING_EAS_PROJECT_ID to the linked Expo project UUID.",
    );
  }
  const updatesEnabled = Boolean(projectId && !localBuild);
  return {
    ...config,
    name,
    slug,
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    scheme: "iransampling",
    platforms: ["android", "ios"],
    updates: {
      enabled: updatesEnabled,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
      ...(updatesEnabled ? { url: `https://u.expo.dev/${projectId}` } : {}),
    },
    ...(updatesEnabled ? { runtimeVersion: { policy: "fingerprint" } } : {}),
    ios: {
      bundleIdentifier: "ir.iransampling.field",
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        ...(localBuild
          ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
          : {}),
      },
    },
    android: {
      package: "ir.iransampling.field",
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#101112",
      },
    },
    plugins: [
      [
        "expo-location",
        {
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isIosBackgroundLocationEnabled: true,
          locationWhenInUsePermission:
            "برای ثبت ورود و خروج در محل اجرای شیفت، به موقعیت دقیق نیاز داریم.",
          locationAlwaysAndWhenInUsePermission:
            "فقط پس از شروع اشتراک، هنگام شیفت فعال موقعیت برای سرپرست همان شیفت و ادمین ثبت می‌شود.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "برای انتخاب عکس مستندات شیفت اجازه دسترسی به تصاویر را بدهید.",
          cameraPermission:
            "برای ثبت عکس اجرای شیفت، اجازه استفاده از دوربین را بدهید.",
          microphonePermission: false,
        },
      ],
      [
        "expo-build-properties",
        { android: { usesCleartextTraffic: localBuild } },
      ],
      "expo-secure-store",
      "expo-sqlite",
    ],
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
      localBuild,
    },
  };
};
