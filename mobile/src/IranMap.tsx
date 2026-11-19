import { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Button, colors, Notice, styles } from "./ui";

type Point = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  stale?: boolean;
};

export function IranMap({
  origin,
  points,
  selected,
  expanded = false,
}: {
  origin: string;
  points: Point[];
  selected?: string;
  expanded?: boolean;
}) {
  const web = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const uri = `${origin}/api/maps/view`;

  useEffect(() => {
    if (!loaded || failed) return;
    web.current?.injectJavaScript(
      `window.setSamplingMap?.(${JSON.stringify({ language: "fa", points, selected })}); true;`,
    );
  }, [failed, loaded, points, selected]);

  return (
    <View style={[local.frame, expanded && local.expanded]}>
      {failed ? (
        <Notice error message="نقشهٔ ایران از سرور بارگیری نشد." />
      ) : (
        <WebView
          ref={web}
          testID="iran-map"
          accessibilityLabel="نقشهٔ ایران"
          source={{ uri }}
          originWhitelist={[origin]}
          onShouldStartLoadWithRequest={(request) => request.url === uri}
          onLoad={(event) => setLoaded(event.nativeEvent.url === uri)}
          onError={() => setFailed(true)}
          onHttpError={(event) => {
            if (event.nativeEvent.url === uri) setFailed(true);
          }}
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          nestedScrollEnabled
          scrollEnabled={false}
          style={local.web}
        />
      )}
    </View>
  );
}

export function IranMapDetail({
  origin,
  point,
  close,
}: {
  origin: string;
  point: Point;
  close: () => void;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={local.sheet}>
        <View style={styles.row}>
          <Text style={[styles.name, local.title]}>{point.label}</Text>
          <Button label="بستن نقشه" icon="close" onPress={close} />
        </View>
        <IranMap
          origin={origin}
          points={[point]}
          selected={point.id}
          expanded
        />
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  frame: {
    height: 260,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  expanded: { flex: 1, height: undefined },
  sheet: { flex: 1, padding: 12, gap: 14, backgroundColor: colors.canvas },
  title: { flex: 1 },
  web: { backgroundColor: colors.canvas },
});
