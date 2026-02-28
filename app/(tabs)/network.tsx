import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState("https://lekker.network/");
  const webViewRef = useRef<WebView>(null);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 84 : 0;

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="globe" size={24} color={Colors.primary} />
            <Text style={styles.headerTitle}>Lekker Network</Text>
          </View>
        </View>
        <View style={[styles.webFallback, { paddingBottom: webBottomInset }]}>
          <Ionicons name="globe-outline" size={64} color={Colors.primary} />
          <Text style={styles.webFallbackTitle}>Lekker Network</Text>
          <Text style={styles.webFallbackText}>
            Open your workspace in a new tab
          </Text>
          <Pressable
            style={({ pressed }) => [styles.openButton, pressed && { opacity: 0.8 }]}
            onPress={() => {
              if (typeof window !== "undefined") {
                window.open("https://lekker.network/", "_blank");
              }
            }}
          >
            <Ionicons name="open-outline" size={18} color={Colors.background} />
            <Text style={styles.openButtonText}>Open Lekker Network</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="globe" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Lekker Network</Text>
        </View>
        <View style={styles.headerActions}>
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
      </View>

      <View style={{ flex: 1 }}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading workspace...</Text>
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onNavigationStateChange={(navState) => {
            if (navState.url) setCurrentUrl(navState.url);
          }}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          domStorageEnabled={true}
          javaScriptEnabled={true}
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={true}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  headerActions: {
    flexDirection: "row",
    gap: 2,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  webView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  webFallbackTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  webFallbackText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  openButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.background,
  },
});
