import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Pressable,
  FlatList,
  TextInput,
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
}

interface FiltersData {
  serviceTypes: string[];
  provinces: string[];
}

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
    <Pressable onPress={onPress} style={[chipStyles.chip, selected && chipStyles.chipSelected]}>
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

export default function DirectoryScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
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

  const bottomPad = Platform.OS === "web" ? 84 : 49 + insets.bottom + 8;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Directory</Text>
        <Text style={styles.headerSubtitle}>Find verified Lekkerpreneurs</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Lekkerpreneurs..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={() => fetchDirectory()}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <Text style={styles.filterLabel}>Province:</Text>
          {filters.provinces.map((p) => (
            <FilterChip
              key={p}
              label={p}
              selected={selectedProvince === p}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedProvince((prev) => (prev === p ? null : p));
              }}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <Text style={styles.filterLabel}>Service:</Text>
          {filters.serviceTypes.map((s) => (
            <FilterChip
              key={s}
              label={s}
              selected={selectedService === s}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedService((prev) => (prev === s ? null : s));
              }}
            />
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
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
            <View style={styles.card}>
              <Pressable
                style={styles.cardHeader}
                onPress={() =>
                  router.push({
                    pathname: "/user-profile/[id]",
                    params: { id: item.id, name: item.name || item.businessName, avatarColor: item.avatarColor },
                  })
                }
              >
                <Avatar name={item.name || item.businessName} color={item.avatarColor} size={50} />
                <View style={styles.cardInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.cardName}>{item.name || item.businessName}</Text>
                    {item.isVerified && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
                  </View>
                  <Text style={styles.cardBusiness}>{item.businessName}</Text>
                  <View style={styles.cardMeta}>
                    <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.cardLocation}>{item.location}, {item.province}</Text>
                  </View>
                </View>
              </Pressable>
              <View style={styles.serviceBadge}>
                <Ionicons name="briefcase-outline" size={12} color={Colors.primary} />
                <Text style={styles.serviceText}>{item.serviceType}</Text>
              </View>
              {!!item.bio && <Text style={styles.cardBio}>{item.bio}</Text>}
              <Pressable
                style={({ pressed }) => [styles.chatButton, pressed && { opacity: 0.8 }]}
                onPress={() => handleStartChat(item)}
                disabled={startingChat === item.id}
              >
                {startingChat === item.id ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <>
                    <Ionicons name="chatbubble-outline" size={16} color={Colors.background} />
                    <Text style={styles.chatButtonText}>Start Chat</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No Lekkerpreneurs found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingVertical: 8 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(28), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 2 },
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
  filtersRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: "center" },
  filterLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textMuted, marginRight: 8 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", gap: 12, marginBottom: 10 },
  cardInfo: { flex: 1, justifyContent: "center" },
  cardName: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  cardBusiness: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.primary, marginTop: 1 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  cardLocation: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
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
  serviceText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  cardBio: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
  },
  chatButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.background },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted },
});