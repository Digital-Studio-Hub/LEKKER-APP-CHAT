import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
  FlatList,
  TextInput,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { getApiUrl } from "@/lib/query-client";
import { startChatWithContact } from "@/lib/chat-api";
import { useAuth } from "@/lib/auth-context";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

interface DirectoryEntry {
  id: string;
  name: string;
  businessName: string;
  serviceType: string;
  location: string;
  province: string;
  phone: string;
  bio: string;
  avatarColor: string;
  isVerified?: boolean;
  memberSince?: string;
}

interface FiltersData {
  serviceTypes: string[];
  provinces: string[];
}

type TabMode = "directory" | "search" | "browse";

function Avatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Poppins_600SemiBold", color: "#fff", fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[chipStyles.chip, selected && chipStyles.chipSelected]}
    >
      <Text style={[chipStyles.label, selected && chipStyles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  labelSelected: {
    color: Colors.background,
  },
});

function DirectoryView() {
  const dirInsets = useSafeAreaInsets();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [filters, setFilters] = useState<FiltersData>({ serviceTypes: [], provinces: [] });
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [startingChat, setStartingChat] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchDirectory();
    }, [selectedService, selectedProvince, searchText]),
  );

  async function fetchDirectory(retries = 2) {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (selectedService) params.set("serviceType", selectedService);
      if (selectedProvince) params.set("province", selectedProvince);
      if (searchText.trim()) params.set("search", searchText.trim());

      const url = new URL(`/api/directory?${params.toString()}`, getApiUrl());
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      setEntries(data.entries);
      setFilters(data.filters);
    } catch (e) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchDirectory(retries - 1);
      }
      console.error("Directory fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStartChat(entry: DirectoryEntry) {
    setStartingChat(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { chat, message, code } = await startChatWithContact({
        lekkerNetworkId: entry.id,
        phone: entry.phone || undefined,
      });
      if (chat?.id) {
        router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
        return;
      }
      if (code === "USER_NOT_REGISTERED") {
        Alert.alert(
          "Not on Lekker Chat yet",
          message || "Ask them to install Lekker Chat and register with the same phone or email.",
        );
      } else {
        Alert.alert("Couldn't start chat", message || "Please try again.");
      }
    } catch (e) {
      console.error("Start chat error:", e);
      Alert.alert("Couldn't start chat", "Please try again.");
    } finally {
      setStartingChat(null);
    }
  }

  function toggleService(service: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService((prev) => (prev === service ? null : service));
  }

  function toggleProvince(province: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProvince((prev) => (prev === province ? null : province));
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={dirStyles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={dirStyles.searchInput}
          placeholder="Search Lekkerpreneurs..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={fetchDirectory}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => { setSearchText(""); }}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dirStyles.filtersRow}>
          <Text style={dirStyles.filterLabel}>Province:</Text>
          {filters.provinces.map((p) => (
            <FilterChip key={p} label={p} selected={selectedProvince === p} onPress={() => toggleProvince(p)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dirStyles.filtersRow}>
          <Text style={dirStyles.filterLabel}>Service:</Text>
          {filters.serviceTypes.map((s) => (
            <FilterChip key={s} label={s} selected={selectedService === s} onPress={() => toggleService(s)} />
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={dirStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          initialNumToRender={12}
          renderItem={({ item }) => (
            <View style={dirStyles.card}>
              <Pressable
                style={dirStyles.cardHeader}
                onPress={() =>
                  router.push({
                    pathname: "/user-profile/[id]",
                    params: { id: item.id, name: item.name || item.businessName, avatarColor: item.avatarColor },
                  })
                }
              >
                <Avatar name={item.name || item.businessName} color={item.avatarColor} size={50} />
                <View style={dirStyles.cardInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={dirStyles.cardName}>{item.name || item.businessName}</Text>
                    {item.isVerified && (
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    )}
                  </View>
                  <Text style={dirStyles.cardBusiness}>{item.businessName}</Text>
                  <View style={dirStyles.cardMeta}>
                    <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                    <Text style={dirStyles.cardLocation}>{item.location}, {item.province}</Text>
                  </View>
                </View>
              </Pressable>
              <View style={dirStyles.serviceBadge}>
                <Ionicons name="briefcase-outline" size={12} color={Colors.primary} />
                <Text style={dirStyles.serviceText}>{item.serviceType}</Text>
              </View>
              <Text style={dirStyles.cardBio}>{item.bio}</Text>
              <Pressable
                style={({ pressed }) => [dirStyles.chatButton, pressed && { opacity: 0.8 }]}
                onPress={() => handleStartChat(item)}
                disabled={startingChat === item.id}
              >
                {startingChat === item.id ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <>
                    <Ionicons name="chatbubble-outline" size={16} color={Colors.background} />
                    <Text style={dirStyles.chatButtonText}>Start Chat</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
          contentContainerStyle={[
            dirStyles.listContent,
            { paddingBottom: Platform.OS === "web" ? 84 : 49 + dirInsets.bottom + 8 },
          ]}
          ListEmptyComponent={
            <View style={dirStyles.emptyState}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={dirStyles.emptyText}>No Lekkerpreneurs found</Text>
              <Text style={dirStyles.emptySubtext}>Try adjusting your filters</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const dirStyles = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    height: 42,
  },
  filtersRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
  },
  filterLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  cardInfo: {
    flex: 1,
    justifyContent: "center",
  },
  cardName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  cardBusiness: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primary,
    marginTop: 1,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  cardLocation: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  serviceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.cardElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  serviceText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  cardBio: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chatButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  emptySubtext: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});

const GOOGLE_CSE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0D0D0D;
      color: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 8px;
    }
    .gsc-control-cse { background-color: #0D0D0D !important; border: none !important; padding: 0 !important; }
    .gsc-input-box { background-color: #1A1A1A !important; border: 1px solid #2A2A2A !important; border-radius: 12px !important; }
    .gsc-input { background-color: transparent !important; color: #FFFFFF !important; }
    .gsc-search-button-v2 { background-color: #F5B800 !important; border: none !important; border-radius: 8px !important; padding: 10px 16px !important; }
    .gsc-search-button-v2 svg { fill: #0D0D0D !important; }
    .gsc-results .gsc-result { background-color: #1A1A1A !important; border: none !important; border-radius: 10px !important; margin-bottom: 8px !important; padding: 12px !important; }
    .gs-title, .gs-title * { color: #F5B800 !important; text-decoration: none !important; }
    .gs-snippet { color: #CCCCCC !important; }
    .gs-visibleUrl { color: #888888 !important; }
    .gsc-above-wrapper-area { border: none !important; }
    .gsc-result-info { color: #888888 !important; }
    .gcsc-more-maybe-branding-root { display: none !important; }
    .gsc-adBlock { display: none !important; }
    .gsc-cursor-page { color: #F5B800 !important; background-color: #1A1A1A !important; border-radius: 4px !important; padding: 4px 8px !important; }
    .gsc-cursor-current-page { background-color: #F5B800 !important; color: #0D0D0D !important; }
    table { background-color: transparent !important; }
    td { background-color: transparent !important; }
    .gsc-table-result { background-color: transparent !important; }
    a.gs-title:hover { color: #FFD54F !important; }
  </style>
</head>
<body>
  <div class="gcse-search"></div>
  <script async src="https://cse.google.com/cse.js?cx=a4df62a18cab149ef"></script>
  <script>
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a');
      if (link && link.href && !link.href.includes('google.com/cse')) {
        e.preventDefault();
        e.stopPropagation();
        window.ReactNativeWebView ? window.ReactNativeWebView.postMessage(JSON.stringify({type:'link', url: link.href, title: link.textContent || ''})) : window.parent.postMessage(JSON.stringify({type:'link', url: link.href, title: link.textContent || ''}), '*');
      }
    }, true);
  </script>
</body>
</html>
`;

function SearchViewWeb() {
  const [isLoading, setIsLoading] = useState(true);
  const webBottomInset = 84;

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "link" && data.url) {
          router.push({ pathname: "/in-app-browser", params: { url: data.url, title: data.title || "" } });
        }
      } catch {}
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <View style={{ flex: 1, paddingBottom: webBottomInset }}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading search...</Text>
        </View>
      )}
      <iframe
        srcDoc={GOOGLE_CSE_HTML}
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#0D0D0D",
        } as any}
        onLoad={() => setIsLoading(false)}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </View>
  );
}

function SearchViewNative() {
  const [isLoading, setIsLoading] = useState(true);
  const webViewRef = useRef<any>(null);
  const searchInsets = useSafeAreaInsets();
  const searchBottomPad = 49 + searchInsets.bottom + 8;

  return (
    <View style={{ flex: 1, paddingBottom: searchBottomPad }}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading search...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: GOOGLE_CSE_HTML }}
        style={{ flex: 1, backgroundColor: Colors.background }}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "link" && data.url) {
              router.push({ pathname: "/in-app-browser", params: { url: data.url, title: data.title || "" } });
            }
          } catch {}
        }}
      />
    </View>
  );
}

function SearchView() {
  if (Platform.OS === "web") return <SearchViewWeb />;
  return <SearchViewNative />;
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

function BrowseView() {
  const [isLoading, setIsLoading] = useState(true);
  const webViewRef = useRef<any>(null);
  const [currentUrl, setCurrentUrl] = useState("https://lekker.network/");
  const browseInsets = useSafeAreaInsets();
  const browseBottomPad = 49 + browseInsets.bottom + 8;

  if (Platform.OS === "web") {
    return <WebIframe />;
  }

  return (
    <View style={{ flex: 1, paddingBottom: browseBottomPad }}>
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
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={{ flex: 1, backgroundColor: Colors.background }}
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
  );
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const hasNetworkAccess = !!user?.lekkerNetworkAccess;
  const [activeTab, setActiveTab] = useState<TabMode>("directory");
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Network</Text>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "directory" && styles.tabActive]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("directory"); }}
        >
          <Ionicons name="people" size={16} color={activeTab === "directory" ? Colors.background : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "directory" && styles.tabTextActive]}>Directory</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "search" && styles.tabActive]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("search"); }}
        >
          <Ionicons name="search" size={16} color={activeTab === "search" ? Colors.background : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "search" && styles.tabTextActive]}>Search</Text>
        </Pressable>
        {hasNetworkAccess && (
          <Pressable
            style={[styles.tab, activeTab === "browse" && styles.tabActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("browse"); }}
          >
            <Ionicons name="globe" size={16} color={activeTab === "browse" ? Colors.background : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === "browse" && styles.tabTextActive]}>Browse</Text>
          </Pressable>
        )}
      </View>

      {activeTab === "directory" && <DirectoryView />}
      {activeTab === "search" && <SearchView />}
      {activeTab === "browse" && hasNetworkAccess && <BrowseView />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(28),
    color: Colors.text,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.background,
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
