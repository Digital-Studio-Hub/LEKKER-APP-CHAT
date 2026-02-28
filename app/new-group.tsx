import React, { useState, useEffect } from "react";
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
import { storage, GroupMember } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

interface SelectableContact {
  id: string;
  name: string;
  phone: string;
  avatarColor: string;
  isLekkerpreneur: boolean;
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
  const [contacts, setContacts] = useState<SelectableContact[]>([]);
  const [searchText, setSearchText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const selectedCount = contacts.filter((c) => c.selected).length;

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    setIsLoading(true);
    try {
      const url = new URL("/api/directory", getApiUrl());
      const res = await fetch(url.toString());
      const data = await res.json();
      const entries: SelectableContact[] = data.entries.map((e: any) => ({
        id: e.phone,
        name: e.name,
        phone: e.phone,
        avatarColor: e.avatarColor,
        isLekkerpreneur: true,
        selected: false,
      }));

      if (Platform.OS !== "web") {
        try {
          const Contacts = await import("expo-contacts");
          const { status } = await Contacts.requestPermissionsAsync();
          if (status === "granted") {
            const { data: phoneContacts } = await Contacts.getContactsAsync({
              fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            });
            const dirPhones = new Set(entries.map((e) => e.phone));
            const seen = new Set<string>();
            for (const c of phoneContacts) {
              if (!c.phoneNumbers || !c.name) continue;
              for (const pn of c.phoneNumbers) {
                if (!pn.number) continue;
                const normalized = normalizePhone(pn.number);
                if (dirPhones.has(normalized) || seen.has(normalized)) continue;
                seen.add(normalized);
                entries.push({
                  id: normalized,
                  name: c.name,
                  phone: normalized,
                  avatarColor: randomColor(),
                  isLekkerpreneur: false,
                  selected: false,
                });
              }
            }
          }
        } catch (e) {}
      }

      entries.sort((a, b) => {
        if (a.isLekkerpreneur !== b.isLekkerpreneur) return a.isLekkerpreneur ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setContacts(entries);
    } catch (e) {
      console.error("Error loading contacts:", e);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleContact(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    );
  }

  async function handleCreate() {
    if (!groupName.trim() || selectedCount < 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const members: GroupMember[] = contacts
      .filter((c) => c.selected)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        avatarColor: c.avatarColor,
      }));

    if (user) {
      members.push({
        id: user.id,
        name: user.displayName,
        phone: user.phoneNumber,
        avatarColor: user.avatarColor,
      });
    }

    const conversation = await storage.createGroupConversation(groupName.trim(), members);
    router.back();
    setTimeout(() => {
      router.push({ pathname: "/chat/[id]", params: { id: conversation.id } });
    }, 100);
  }

  const filtered = searchText
    ? contacts.filter((c) => c.name.toLowerCase().includes(searchText.toLowerCase()) || c.phone.includes(searchText))
    : contacts;

  const selectedContacts = contacts.filter((c) => c.selected);

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
            {selectedContacts.map((c) => (
              <View key={c.id} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{c.name.split(" ")[0]}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.createButton,
              pressed && { opacity: 0.8 },
              !groupName.trim() && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!groupName.trim()}
          >
            <Ionicons name="chatbubbles" size={18} color={Colors.background} />
            <Text style={styles.createButtonText}>Create Group</Text>
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
            data={selectedContacts}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
            renderItem={({ item }) => (
              <Pressable onPress={() => toggleContact(item.id)} style={styles.selectedItem}>
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
          placeholder="Search contacts..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, Platform.OS === "web" ? { paddingBottom: 84 } : undefined]}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.contactItem, pressed && { backgroundColor: Colors.cardElevated }]}
              onPress={() => toggleContact(item.id)}
            >
              <Avatar name={item.name} color={item.avatarColor} />
              <View style={styles.contactInfo}>
                <View style={styles.contactNameRow}>
                  <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                  {item.isLekkerpreneur && (
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  )}
                </View>
                <Text style={styles.contactPhone}>{item.phone}</Text>
              </View>
              <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                {item.selected && <Ionicons name="checkmark" size={16} color={Colors.background} />}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No contacts found</Text>
            </View>
          }
        />
      )}
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

const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"];
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
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
