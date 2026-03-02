import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { searchUsers, createGroupChat, SearchUser } from "@/lib/chat-api";

interface SelectableUser {
  id: string;
  name: string;
  username: string;
  avatarColor: string;
  isVerified: boolean;
  profilePhoto: string | null;
  businessName: string | null;
  selected: boolean;
}

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Poppins_600SemiBold", color: "#fff", fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  );
}

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState<"select" | "name">("select");
  const [users, setUsers] = useState<SelectableUser[]>([]);
  const [searchText, setSearchText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const selectedUsers = users.filter((u) => u.selected);
  const selectedCount = selectedUsers.length;

  const handleSearch = useCallback(async (query: string) => {
    setSearchText(query);
    if (query.trim().length < 2) {
      if (query.trim().length === 0) {
        setUsers((prev) => prev.filter((u) => u.selected));
        setHasSearched(false);
      }
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await searchUsers(query);
      const filtered = results.filter((r) => r.id !== user?.id);
      setUsers((prev) => {
        const selectedMap = new Map(prev.filter((u) => u.selected).map((u) => [u.id, u]));
        const merged: SelectableUser[] = [];
        const seen = new Set<string>();

        for (const [id, sel] of selectedMap) {
          merged.push(sel);
          seen.add(id);
        }

        for (const r of filtered) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          merged.push(mapSearchUser(r));
        }

        return merged;
      });
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  function mapSearchUser(r: SearchUser): SelectableUser {
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim() || r.username,
      username: r.username,
      avatarColor: r.avatarColor || "#F5B800",
      isVerified: r.isVerifiedLekkerpreneur ?? false,
      profilePhoto: r.profilePhoto,
      businessName: r.businessName,
      selected: false,
    };
  }

  function toggleUser(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, selected: !u.selected } : u)),
    );
  }

  async function handleCreate() {
    if (!groupName.trim() || selectedCount < 1 || isCreating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCreating(true);

    try {
      const participantIds = selectedUsers.map((u) => u.id);
      const chat = await createGroupChat(groupName.trim(), participantIds);

      if (chat) {
        router.back();
        setTimeout(() => {
          router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
        }, 100);
      }
    } catch (e) {
      console.error("Failed to create group:", e);
    } finally {
      setIsCreating(false);
    }
  }

  const displayList = searchText.trim().length >= 2
    ? users
    : users.filter((u) => u.selected);

  if (step === "name") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setStep("select")} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Group Name</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.nameSection}>
          <View style={styles.groupIconLarge}>
            <Ionicons name="people" size={40} color={Colors.primary} />
          </View>
          <TextInput
            style={styles.groupNameInput}
            placeholder="Enter group name"
            placeholderTextColor={Colors.textMuted}
            value={groupName}
            onChangeText={setGroupName}
            autoFocus
            maxLength={50}
          />
          <Text style={styles.membersLabel}>{selectedCount} member{selectedCount !== 1 ? "s" : ""} selected</Text>

          <View style={styles.selectedChips}>
            {selectedUsers.map((u) => (
              <View key={u.id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{u.name.split(" ")[0]}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.createButton,
              pressed && { opacity: 0.8 },
              (!groupName.trim() || isCreating) && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!groupName.trim() || isCreating}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <>
                <Ionicons name="chatbubbles" size={18} color={Colors.background} />
                <Text style={styles.createButtonText}>Create Group</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Group</Text>
        <Pressable
          onPress={() => setStep("name")}
          style={[styles.nextButton, selectedCount < 1 && { opacity: 0.4 }]}
          disabled={selectedCount < 1}
        >
          <Text style={styles.nextButtonText}>Next</Text>
        </Pressable>
      </View>

      {selectedCount > 0 && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedCount} selected</Text>
          <FlatList
            data={selectedUsers}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
            renderItem={({ item }) => (
              <Pressable onPress={() => toggleUser(item.id)} style={styles.selectedItem}>
                <Avatar name={item.name} color={item.avatarColor} size={36} />
                <View style={styles.removeIcon}>
                  <Ionicons name="close-circle" size={16} color={Colors.danger} />
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search registered users..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={handleSearch}
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => handleSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isSearching ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, Platform.OS === "web" ? { paddingBottom: 84 } : undefined]}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.contactItem, pressed && { backgroundColor: Colors.cardElevated }]}
              onPress={() => toggleUser(item.id)}
            >
              <Avatar name={item.name} color={item.avatarColor} />
              <View style={styles.contactInfo}>
                <View style={styles.contactNameRow}>
                  <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                  {item.isVerified && (
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  )}
                </View>
                <Text style={styles.contactPhone}>@{item.username}</Text>
              </View>
              <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                {item.selected && <Ionicons name="checkmark" size={16} color={Colors.background} />}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {hasSearched ? "No users found" : "Search for registered users to add to the group"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  nextButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 20,
  },
  nextButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.background },
  selectionBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  selectionText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  selectedList: { gap: 10 },
  selectedItem: { position: "relative" },
  removeIcon: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    marginHorizontal: 16,
    marginVertical: 8,
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
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16 },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  contactName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text, flexShrink: 1 },
  contactPhone: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  nameSection: {
    padding: 24,
    alignItems: "center",
    gap: 16,
  },
  groupIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  groupNameInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 18,
    color: Colors.text,
    fontFamily: "Poppins_500Medium",
    borderWidth: 1,
    borderColor: Colors.border,
    width: "100%",
    textAlign: "center",
  },
  membersLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  selectedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  chip: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    width: "100%",
    marginTop: 8,
  },
  createButtonDisabled: { opacity: 0.4 },
  createButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
});
