import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

function WebIframe() {
  const [isLoading, setIsLoading] = useState(true);
  const webBottomInset = 84;

  return (
    <View style={{ flex: 1, paddingBottom: webBottomInset }}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading workspace...</Text>
        </View>
      )}
      <iframe
        src="https://lekker.network/"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#0D0D0D",
        } as any}
        onLoad={() => setIsLoading(false)}
        allow="clipboard-write; clipboard-read"
      />
    </View>
  );
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState("https://lekker.network/");
  const webViewRef = useRef<any>(null);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="globe" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Lekker Network</Text>
        </View>
        {Platform.OS !== "web" && (
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
        )}
      </View>

      {Platform.OS === "web" ? (
        <WebIframe />
      ) : (
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
            onNavigationStateChange={(navState: any) => {
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
      )}
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
});
