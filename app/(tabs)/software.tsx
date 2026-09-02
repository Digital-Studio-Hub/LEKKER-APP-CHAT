import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { fetchLekkerSoftwareUrl } from "@/lib/lekker-session";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

export default function SoftwareScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webViewRef = useRef<any>(null);
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const bottomPad = Platform.OS === "web" ? 84 : 49 + insets.bottom + 8;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await fetchLekkerSoftwareUrl();
        if (!cancelled) setStartUrl(url);
      } catch {
        if (!cancelled) {
          setStartUrl(LEKKER_NETWORK_URL);
          setLoadError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Software</Text>
        </View>
        {!startUrl ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <iframe
            src={startUrl}
            style={{ flex: 1, width: "100%", border: "none", backgroundColor: "#0D0D0D" } as any}
            allow="clipboard-write; clipboard-read"
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Software</Text>
        <Text style={styles.headerSubtitle}>lekker.network dashboard</Text>
      </View>

      <View style={styles.navBar}>
        <Pressable onPress={() => webViewRef.current?.goBack()} style={styles.navButton}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Pressable onPress={() => webViewRef.current?.goForward()} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </Pressable>
        <Pressable onPress={() => webViewRef.current?.reload()} style={styles.navButton}>
          <Ionicons name="refresh" size={20} color={Colors.text} />
        </Pressable>
      </View>

      {!startUrl ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Signing in to lekker.network...</Text>
        </View>
      ) : (
        <View style={{ flex: 1, paddingBottom: bottomPad }}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: startUrl }}
            style={{ flex: 1, backgroundColor: Colors.background }}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            allowsBackForwardNavigationGestures
          />
        </View>
      )}

      {loadError && (
        <Text style={styles.errorHint}>Could not get SSO session — showing login page</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 8 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(24), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  navBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  navButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  errorHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    paddingBottom: 8,
  },
});