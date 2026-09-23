import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { fetchLekkerSoftwareUrl, SOFTWARE_SHORTCUTS } from "@/lib/lekker-session";
import { LEKKER_NETWORK_URL } from "@/constants/ecosystem";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth-context";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

export default function SoftwareScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webViewRef = useRef<any>(null);
  const { user } = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeShortcut, setActiveShortcut] = useState("home");
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const bottomPad = Platform.OS === "web" ? 84 : 49 + insets.bottom + 8;

  const loadUrl = useCallback(async (next?: string, shortcutId = "home") => {
    setIsLoading(true);
    setLoadError(false);
    setGateMessage(null);
    setActiveShortcut(shortcutId);
    if (!user?.lekkerNetworkAccess || !user?.lekkerNetworkId) {
      setStartUrl(null);
      setIsLoading(false);
      setGateMessage(
        !user?.phoneVerified
          ? "Confirm your mobile number first, then turn on Lekkerpreneur access in Settings."
          : "Turn on Lekkerpreneur access in Settings to open your workspace dashboard signed in.",
      );
      return;
    }
    try {
      const url = await fetchLekkerSoftwareUrl(next);
      setStartUrl(url);
    } catch {
      setStartUrl(next ? `${LEKKER_NETWORK_URL}${next}` : LEKKER_NETWORK_URL);
      setLoadError(true);
    }
  }, [user?.lekkerNetworkAccess, user?.lekkerNetworkId, user?.phoneVerified]);

  useFocusEffect(
    useCallback(() => {
      const next =
        typeof params.next === "string" && params.next.startsWith("/app")
          ? params.next
          : "/app";
      const shortcut =
        SOFTWARE_SHORTCUTS.find((s) => next === s.next || next.startsWith(s.next + "/"))?.id ||
        "home";
      loadUrl(next, shortcut);
    }, [loadUrl, params.next]),
  );

  async function openShortcut(id: string, next: string, native?: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (native) {
      router.push(native as any);
      return;
    }
    await loadUrl(next, id);
  }

  const shortcutBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.shortcutRow}
    >
      {SOFTWARE_SHORTCUTS.map((s) => {
        const active = activeShortcut === s.id;
        const native = "native" in s ? s.native : undefined;
        return (
          <Pressable
            key={s.id}
            onPress={() => openShortcut(s.id, s.next, native)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Ionicons
              name={s.icon}
              size={14}
              color={active ? Colors.background : Colors.primary}
            />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Software</Text>
          <Text style={styles.headerSubtitle}>lekker.network — deep-link shortcuts</Text>
        </View>
        {shortcutBar}
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

      {shortcutBar}

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

      {gateMessage ? (
        <View style={styles.centered}>
          <Ionicons name="business-outline" size={40} color={Colors.primary} />
          <Text style={styles.loadingText}>{gateMessage}</Text>
          <Pressable
            onPress={() => router.push("/settings")}
            style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 8 }}
          >
            <Text style={{ fontFamily: "Poppins_600SemiBold", color: Colors.background }}>Open Settings</Text>
          </Pressable>
        </View>
      ) : !startUrl ? (
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
  shortcutRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  chipTextActive: { color: Colors.background },
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
