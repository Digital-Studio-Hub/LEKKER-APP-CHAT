import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";

type PresenceStatus = "online" | "away" | "dnd" | "offline";

const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; icon: string; color: string }[] = [
  { value: "online", label: "Online", icon: "ellipse", color: Colors.online },
  { value: "away", label: "Away", icon: "ellipse", color: Colors.away },
  { value: "dnd", label: "Do Not Disturb", icon: "remove-circle", color: Colors.dnd },
  { value: "offline", label: "Offline", icon: "ellipse-outline", color: Colors.offline },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, logout } = useAuth();
  const [selectedPresence, setSelectedPresence] = useState<PresenceStatus>(
    user?.presence || "online",
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  async function handlePresenceChange(presence: PresenceStatus) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPresence(presence);
    await updateProfile({ presence });
  }

  async function handleLogout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS === "web") {
      await logout();
      router.replace("/");
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/");
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.8 }]}
          onPress={() => router.push("/profile")}
        >
          <View style={[styles.profileAvatar, { backgroundColor: user?.avatarColor || Colors.primary }]}>
            <Text style={styles.profileAvatarText}>
              {user?.displayName?.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase() || "?"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.displayName || "User"}</Text>
            <Text style={styles.profileStatus}>{user?.status || ""}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          {PRESENCE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.optionRow,
                selectedPresence === option.value && styles.optionRowSelected,
              ]}
              onPress={() => handlePresenceChange(option.value)}
            >
              <Ionicons
                name={option.icon as any}
                size={14}
                color={option.color}
              />
              <Text style={styles.optionLabel}>{option.label}</Text>
              {selectedPresence === option.value && (
                <Ionicons name="checkmark" size={20} color={Colors.primary} style={{ marginLeft: "auto" }} />
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.optionRow}>
            <Ionicons name="eye-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Last Seen</Text>
            <Text style={styles.optionValue}>Everyone</Text>
          </View>
          <View style={styles.optionRow}>
            <Ionicons name="checkmark-done-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Read Receipts</Text>
            <Text style={styles.optionValue}>On</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.optionRow}>
            <Ionicons name="call-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Phone</Text>
            <Text style={styles.optionValue}>{user?.phoneNumber || ""}</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.8 }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.version}>Lekker Chat v1.0.0</Text>
      </ScrollView>
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
    paddingBottom: 12,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  content: { padding: 16, paddingBottom: 40 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 24,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#fff" },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  profileStatus: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  optionRowSelected: {
    backgroundColor: Colors.cardElevated,
  },
  optionLabel: { fontFamily: "Poppins_400Regular", fontSize: 15, color: Colors.text, flex: 1 },
  optionValue: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  logoutText: { fontFamily: "Poppins_500Medium", fontSize: 15, color: Colors.danger },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 24,
  },
});
