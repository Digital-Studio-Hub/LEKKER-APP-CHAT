import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

export default function InAppBrowserScreen() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [isLoading, setIsLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(url || "");
  const [pageTitle, setPageTitle] = useState(title || "");
  const webViewRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  function getDomain(u: string) {
    try {
      return new URL(u).hostname.replace("www.", "");
    } catch {
      return u;
    }
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {pageTitle || getDomain(currentUrl)}
            </Text>
            <Text style={styles.headerUrl} numberOfLines={1}>
              {getDomain(currentUrl)}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        {isLoading && (
          <View style={styles.loadingBar}>
            <View style={styles.loadingBarFill} />
          </View>
        )}
        <iframe
          src={url}
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            border: "none",
            backgroundColor: "#ffffff",
          } as any}
          onLoad={() => setIsLoading(false)}
          allow="clipboard-write; clipboard-read"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {pageTitle || getDomain(currentUrl)}
          </Text>
          <Text style={styles.headerUrl} numberOfLines={1}>
            {getDomain(currentUrl)}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading && (
        <View style={styles.loadingBar}>
          <View style={styles.loadingBarFill} />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onNavigationStateChange={(navState: any) => {
          if (navState.url) setCurrentUrl(navState.url);
          if (navState.title) setPageTitle(navState.title);
          setCanGoBack(!!navState.canGoBack);
          setCanGoForward(!!navState.canGoForward);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        allowsBackForwardNavigationGestures={true}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
      />
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          onPress={() => webViewRef.current?.goBack()}
          style={[styles.bottomButton, !canGoBack && styles.bottomButtonDisabled]}
          disabled={!canGoBack}
        >
          <Ionicons name="chevron-back" size={22} color={canGoBack ? Colors.text : Colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => webViewRef.current?.goForward()}
          style={[styles.bottomButton, !canGoForward && styles.bottomButtonDisabled]}
          disabled={!canGoForward}
        >
          <Ionicons name="chevron-forward" size={22} color={canGoForward ? Colors.text : Colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => webViewRef.current?.reload()} style={styles.bottomButton}>
          <Ionicons name="refresh" size={20} color={Colors.text} />
        </Pressable>
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
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  headerUrl: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
  },
  headerSpacer: {
    width: 36,
  },
  loadingBar: {
    height: 2,
    backgroundColor: Colors.card,
  },
  loadingBarFill: {
    height: 2,
    width: "60%",
    backgroundColor: Colors.primary,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  bottomButton: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomButtonDisabled: {
    opacity: 0.4,
  },
});
