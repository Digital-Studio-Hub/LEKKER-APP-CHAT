import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  FlatList,
  ActivityIndicator,
  SectionList,
  Linking,
  Share,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { searchUsers, createP2PChat, SearchUser } from "@/lib/chat-api";
import { getApiUrl } from "@/lib/query-client";

interface MatchedContact {
  id: string;
  name: string;
  phone: string;
  isLekkerpreneur: boolean;
  avatarColor: string;
}

function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Poppins_600SemiBold", color: "#fff", fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("27") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+27${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone;
}

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [otherContacts, setOtherContacts] = useState<MatchedContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [startingChat, setStartingChat] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (searchText.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchUsers(searchText.trim());
        const filtered = user ? results.filter(u => u.id !== user.id) : results;
        setSearchResults(filtered);
      } catch (e) {
        console.error("Search error:", e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText, user]);

  async function loadContacts() {
    if (Platform.OS === "web") {
      await loadDirectoryOnly();
      return;
    }

    setIsLoadingContacts(true);
    try {
      const Contacts = await import("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setPermissionDenied(true);
        await loadDirectoryOnly();
        setIsLoadingContacts(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const url = new URL("/api/directory", getApiUrl());
      const res = await fetch(url.toString());
      const dirData = await res.json();
      const dirPhones = new Map<string, any>();
      for (const entry of dirData.entries) {
        dirPhones.set(normalizePhone(entry.phone), entry);
      }

      const matched: MatchedContact[] = [];
      const others: MatchedContact[] = [];
      const seen = new Set<string>();

      for (const contact of data) {
        if (!contact.phoneNumbers || !contact.name) continue;

        for (const pn of contact.phoneNumbers) {
          if (!pn.number) continue;
          const normalized = normalizePhone(pn.number);
          if (seen.has(normalized)) continue;
          seen.add(normalized);

          const dirEntry = dirPhones.get(normalized);
          const contactItem: MatchedContact = {
            id: normalized,
            name: contact.name,
            phone: normalized,
            isLekkerpreneur: !!dirEntry,
            avatarColor: dirEntry?.avatarColor || randomColor(),
          };

          if (dirEntry) {
            matched.push(contactItem);
          } else {
            others.push(contactItem);
          }
        }
      }

      for (const [phone, entry] of dirPhones) {
        if (!seen.has(phone)) {
          matched.push({
            id: phone,
            name: entry.name,
            phone,
            isLekkerpreneur: true,
            avatarColor: entry.avatarColor,
          });
        }
      }

      matched.sort((a, b) => a.name.localeCompare(b.name));
      others.sort((a, b) => a.name.localeCompare(b.name));

      setMatchedContacts(matched);
      setOtherContacts(others);
    } catch (e) {
      console.error("Error loading contacts:", e);
      await loadDirectoryOnly();
    } finally {
      setIsLoadingContacts(false);
    }
  }

  async function loadDirectoryOnly() {
    try {
      const url = new URL("/api/directory", getApiUrl());
      const res = await fetch(url.toString());
      const dirData = await res.json();
      const entries: MatchedContact[] = dirData.entries.map((e: any) => ({
        id: e.phone,
        name: e.name,
        phone: e.phone,
        isLekkerpreneur: true,
        avatarColor: e.avatarColor,
      }));
      setMatchedContacts(entries);
    } catch (e) {
      console.error("Error loading directory:", e);
    }
  }

  async function handleStartChatWithUser(searchUser: SearchUser) {
    setStartingChat(searchUser.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const chat = await createP2PChat(searchUser.id);
      if (chat) {
        router.back();
        setTimeout(() => {
          router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
        }, 100);
      } else {
        Alert.alert("Error", "Could not start chat. Please try again.");
      }
    } catch (e) {
      console.error("Start chat error:", e);
      Alert.alert("Error", "Could not start chat. Please try again.");
    } finally {
      setStartingChat(null);
    }
  }

  async function handleStartChat(contact: MatchedContact) {
    if (!contact.isLekkerpreneur) {
      handleInvite(contact);
      return;
    }
    setStartingChat(contact.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const results = await searchUsers(contact.phone);
      if (results.length > 0) {
        const chat = await createP2PChat(results[0].id);
        if (chat) {
          router.back();
          setTimeout(() => {
            router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
          }, 100);
          return;
        }
      }
      Alert.alert("Not Found", "This user is not registered on Lekker Chat yet.");
    } catch (e) {
      console.error("Start chat error:", e);
      Alert.alert("Error", "Could not start chat. Please try again.");
    } finally {
      setStartingChat(null);
    }
  }

  async function handleInvite(contact: MatchedContact) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const inviteMessage = `Hey ${contact.name.split(" ")[0]}! Join me on Lekker Chat — the messaging app for South African entrepreneurs. Download it here: https://lekker.network/chat`;

    if (Platform.OS === "web") {
      Alert.alert(
        "Invite to Lekker Chat",
        `${contact.name} is not on Lekker Chat yet. Would you like to invite them?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Copy Invite",
            onPress: () => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(inviteMessage);
              }
              Alert.alert("Copied!", "Invite message copied to clipboard. Send it to your contact.");
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      "Invite to Lekker Chat",
      `${contact.name} is not on Lekker Chat yet. Send them an invite?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send via SMS",
          onPress: () => {
            const smsUrl = Platform.OS === "ios"
              ? `sms:${contact.phone}&body=${encodeURIComponent(inviteMessage)}`
              : `sms:${contact.phone}?body=${encodeURIComponent(inviteMessage)}`;
            Linking.openURL(smsUrl).catch(() => shareInvite(inviteMessage));
          },
        },
        {
          text: "Send via WhatsApp",
          onPress: () => {
            const cleaned = contact.phone.replace(/\D/g, "");
            const waUrl = `https://wa.me/${cleaned}?text=${encodeURIComponent(inviteMessage)}`;
            Linking.openURL(waUrl).catch(() => shareInvite(inviteMessage));
          },
        },
      ],
    );
  }

  async function shareInvite(message: string) {
    try {
      await Share.share({ message });
    } catch (e) {
      console.error("Share error:", e);
    }
  }

  const filteredMatched = searchText
    ? matchedContacts.filter((c) => c.name.toLowerCase().includes(searchText.toLowerCase()) || c.phone.includes(searchText))
    : matchedContacts;

  const filteredOthers = searchText
    ? otherContacts.filter((c) => c.name.toLowerCase().includes(searchText.toLowerCase()) || c.phone.includes(searchText))
    : otherContacts;

  type SectionItem = { _isSearchUser: boolean } & Record<string, any>;

  const sections: { title: string; data: SectionItem[] }[] = [
    ...(searchResults.length > 0 ? [{ title: "Lekker Chat Users", data: searchResults.map(u => ({ ...u, _isSearchUser: true })) as SectionItem[] }] : []),
    ...(filteredMatched.length > 0 ? [{ title: "Lekkerpreneurs", data: filteredMatched.map(c => ({ ...c, _isSearchUser: false })) as SectionItem[] }] : []),
    ...(filteredOthers.length > 0 ? [{ title: "Contacts", data: filteredOthers.map(c => ({ ...c, _isSearchUser: false })) as SectionItem[] }] : []),
  ];

  function getSearchUserDisplayName(u: SearchUser): string {
    return `${u.firstName} ${u.lastName}`.trim() || u.username;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Chat</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users or contacts..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {isSearching && <ActivityIndicator size="small" color={Colors.primary} />}
        {searchText.length > 0 && !isSearching && (
          <Pressable onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {permissionDenied && Platform.OS !== "web" && (
        <Pressable
          style={styles.permissionBanner}
          onPress={() => Linking.openSettings()}
        >
          <Ionicons name="alert-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.permissionText}>
            Enable contacts access in Settings to find friends on Lekker Chat
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </Pressable>
      )}

      {isLoadingContacts ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._isSearchUser ? (item as any).id : (item as any).id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            if (item._isSearchUser) {
              const su = item as unknown as SearchUser & { _isSearchUser: true };
              const displayName = getSearchUserDisplayName(su);
              return (
                <Pressable
                  style={({ pressed }) => [styles.contactItem, pressed && { backgroundColor: Colors.cardElevated }]}
                  onPress={() => handleStartChatWithUser(su)}
                  disabled={startingChat === su.id}
                >
                  <Avatar name={displayName} color={su.avatarColor || "#F5B800"} />
                  <View style={styles.contactInfo}>
                    <View style={styles.contactNameRow}>
                      <Text style={styles.contactName} numberOfLines={1}>{displayName}</Text>
                      {su.isVerifiedLekkerpreneur && (
                        <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      )}
                    </View>
                    <Text style={styles.contactPhone}>@{su.username}{su.businessName ? ` · ${su.businessName}` : ""}</Text>
                  </View>
                  {startingChat === su.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <View style={styles.chatIcon}>
                      <Ionicons name="chatbubble" size={16} color={Colors.background} />
                    </View>
                  )}
                </Pressable>
              );
            }

            const contact = item as unknown as MatchedContact & { _isSearchUser: false };
            return (
              <Pressable
                style={({ pressed }) => [styles.contactItem, pressed && { backgroundColor: Colors.cardElevated }]}
                onPress={() => handleStartChat(contact)}
                disabled={startingChat === contact.id}
              >
                <Avatar name={contact.name} color={contact.avatarColor} />
                <View style={styles.contactInfo}>
                  <View style={styles.contactNameRow}>
                    <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
                    {contact.isLekkerpreneur && (
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    )}
                  </View>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
                {startingChat === contact.id ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : contact.isLekkerpreneur ? (
                  <View style={styles.chatIcon}>
                    <Ionicons name="chatbubble" size={16} color={Colors.background} />
                  </View>
                ) : (
                  <View style={styles.inviteIcon}>
                    <Ionicons name="paper-plane" size={14} color={Colors.primary} />
                  </View>
                )}
              </Pressable>
            );
          }}
          contentContainerStyle={[
            styles.listContent,
            Platform.OS === "web" ? { paddingBottom: 84 } : undefined,
          ]}
          ListFooterComponent={
            <View style={styles.manualSection}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>find people</Text>
                <View style={styles.dividerLine} />
              </View>
              <View style={styles.searchNote}>
                <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
                <Text style={styles.searchNoteText}>
                  Search for registered users above by name, username, phone, or email
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            searchResults.length === 0 && filteredMatched.length === 0 && filteredOthers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>
                  {searchText ? "No contacts match your search" : "No contacts found"}
                </Text>
              </View>
            ) : null
          }
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"];
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    marginHorizontal: 16,
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  sectionCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  contactName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
    flexShrink: 1,
  },
  contactPhone: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  manualSection: {
    marginTop: 24,
    paddingBottom: 40,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: Colors.border },
  dividerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    paddingHorizontal: 12,
  },
  searchNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchNoteText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  permissionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  permissionText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
