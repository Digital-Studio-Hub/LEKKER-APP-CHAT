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
import { getAuthToken } from "@/lib/auth-token";

let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

interface DirectoryEntry {
  id: string;
  workspaceId?: string | null;
  name: string;
  businessName: string;
  tradingName?: string;
  serviceType: string;
  marketplaceServiceLabels?: string[];
  servicesOffered?: string;
  location: string;
  province: string;
  phone: string;
  email?: string;
  website?: string;
  address?: string;
  bio: string;
  avatarColor: string;
  isVerified?: boolean;
  memberSince?: string;
  logoUrl?: string;
}

interface FiltersData {
  /** Marketplace Instant Match parent category names (same as lekker.network Settings) */
  serviceTypes: string[];
  serviceCategories?: Array<{ id: string; name: string }>;
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

/** Shared Instant Match directory — used by Directory tab and Network. */
export function DirectoryView() {
  const dirInsets = useSafeAreaInsets();
  const { user } = useAuth();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [filters, setFilters] = useState<FiltersData>({ serviceTypes: [], provinces: [] });
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enquireFor, setEnquireFor] = useState<DirectoryEntry | null>(null);
  const [enquiryText, setEnquiryText] = useState("");
  const [sendingEnquiry, setSendingEnquiry] = useState(false);

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
      setEntries(data.entries || []);
      setFilters(data.filters || { serviceTypes: [], provinces: [] });
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
          "Message on Marketplace instead",
          "They're listed as a lekkerpreneur but don't have Lekker Chat yet. Send a private enquiry — it appears in Marketplace Chat and their Leads inbox.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Enquire", onPress: () => openEnquire(entry) },
          ],
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

  function openEnquire(entry: DirectoryEntry) {
    if (!entry.workspaceId) {
      Alert.alert("Unavailable", "This listing isn't linked to a workspace yet.");
      return;
    }
    setEnquireFor(entry);
    setEnquiryText("");
  }

  async function submitEnquiry() {
    if (!enquireFor?.workspaceId || enquiryText.trim().length < 3) {
      Alert.alert("Add a brief", "Write a short note about what you need (at least 3 characters).");
      return;
    }
    setSendingEnquiry(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = new URL("/api/directory/enquire", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() || ""}` },
        body: JSON.stringify({
          targetWorkspaceId: enquireFor.workspaceId,
          summary: enquiryText.trim(),
          province: enquireFor.province || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert("Enquiry failed", data.message || "Please try again.");
        return;
      }
      setEnquireFor(null);
      Alert.alert(
        "Enquiry sent",
        "Your phone stays private until you reveal it. The lekkerpreneur can reply in Marketplace Chat — and you'll see it in Enquiries.",
        [
          {
            text: "Open enquiry",
            onPress: () =>
              router.push({ pathname: "/enquiry/[id]", params: { id: data.leadId } }),
          },
          { text: "OK" },
        ],
      );
    } catch (e) {
      console.error("Enquiry error:", e);
      Alert.alert("Enquiry failed", "Please try again.");
    } finally {
      setSendingEnquiry(false);
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

  function toggleExpand(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId((prev) => (prev === id ? null : id));
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
          onSubmitEditing={() => { void fetchDirectory(); }}
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
          renderItem={({ item }) => {
            const expanded = expandedId === item.id;
            const labels = item.marketplaceServiceLabels?.length
              ? item.marketplaceServiceLabels
              : item.serviceType
                ? [item.serviceType]
                : [];
            return (
              <View style={dirStyles.card}>
                <Pressable style={dirStyles.cardHeader} onPress={() => toggleExpand(item.id)}>
                  <Avatar name={item.name || item.businessName} color={item.avatarColor} size={50} />
                  <View style={dirStyles.cardInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={dirStyles.cardName}>{item.businessName}</Text>
                      {item.isVerified && (
                        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      )}
                    </View>
                    {!!item.tradingName && item.tradingName !== item.businessName && (
                      <Text style={dirStyles.cardBusiness}>t/a {item.tradingName}</Text>
                    )}
                    <View style={dirStyles.cardMeta}>
                      <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                      <Text style={dirStyles.cardLocation}>
                        {[item.location, item.province].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={Colors.textMuted}
                  />
                </Pressable>

                <View style={dirStyles.serviceBadge}>
                  <Ionicons name="briefcase-outline" size={12} color={Colors.primary} />
                  <Text style={dirStyles.serviceText} numberOfLines={expanded ? 4 : 1}>
                    {labels.slice(0, expanded ? 6 : 1).join(" · ")}
                  </Text>
                </View>

                {expanded && (
                  <View style={dirStyles.expandedBlock}>
                    {!!(item.servicesOffered || item.bio) && (
                      <Text style={dirStyles.cardBio}>{item.servicesOffered || item.bio}</Text>
                    )}
                    {!!item.website && (
                      <Text style={dirStyles.detailLine}>Website: {item.website}</Text>
                    )}
                    {!!item.address && (
                      <Text style={dirStyles.detailLine}>Address: {item.address}</Text>
                    )}
                    <Text style={dirStyles.privacyHint}>
                      Enquiries keep your number private until you choose to share it — same as Marketplace Instant Match.
                    </Text>
                  </View>
                )}

                <View style={dirStyles.cardActions}>
                  <Pressable
                    style={({ pressed }) => [dirStyles.enquireButton, pressed && { opacity: 0.85 }]}
                    onPress={() => openEnquire(item)}
                  >
                    <Ionicons name="document-text-outline" size={16} color={Colors.background} />
                    <Text style={dirStyles.chatButtonText}>Enquire</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [dirStyles.chatButtonOutline, pressed && { opacity: 0.85 }]}
                    onPress={() => handleStartChat(item)}
                    disabled={startingChat === item.id}
                  >
                    {startingChat === item.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
                        <Text style={dirStyles.chatOutlineText}>Message</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          }}
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

      {enquireFor && (
        <View style={dirStyles.modalOverlay}>
          <View style={dirStyles.modalCard}>
            <Text style={dirStyles.modalTitle}>Enquire — {enquireFor.businessName}</Text>
            <Text style={dirStyles.privacyHint}>
              Signed in as {user?.firstName || "you"}. Your phone stays hidden until you reveal it in the chat.
            </Text>
            <TextInput
              style={dirStyles.enquiryInput}
              placeholder="What do you need? (short brief)"
              placeholderTextColor={Colors.textMuted}
              value={enquiryText}
              onChangeText={setEnquiryText}
              multiline
              maxLength={800}
            />
            <View style={dirStyles.modalActions}>
              <Pressable onPress={() => setEnquireFor(null)} style={dirStyles.modalCancel}>
                <Text style={dirStyles.chatOutlineText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[dirStyles.enquireButton, { flex: 1 }]}
                onPress={submitEnquiry}
                disabled={sendingEnquiry}
              >
                {sendingEnquiry ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={dirStyles.chatButtonText}>Send enquiry</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
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
  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  enquireButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chatButtonOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chatOutlineText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
  },
  expandedBlock: { marginBottom: 10, gap: 6 },
  detailLine: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  privacyHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
    zIndex: 50,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
    gap: 10,
  },
  modalTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  enquiryInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 12 },
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
