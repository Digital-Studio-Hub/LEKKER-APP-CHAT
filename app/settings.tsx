import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Image,
  Switch,
  TextInput,
  Linking,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { useAuth } from "@/lib/auth-context";
import { requestNotificationPermissions, areNotificationsEnabled, disableNotifications, canAskForNotifications } from "@/lib/notifications";
import { requestLocationPermissions, isLocationEnabled, getLastLocation, disableLocation, UserLocation } from "@/lib/location";
import { storage, BlockedUser } from "@/lib/storage";

type PresenceStatus = "online" | "away" | "dnd" | "offline";

const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; icon: string; color: string }[] = [
  { value: "online", label: "Online", icon: "ellipse", color: Colors.online },
  { value: "away", label: "Away", icon: "ellipse", color: Colors.away },
  { value: "dnd", label: "Do Not Disturb", icon: "remove-circle", color: Colors.dnd },
  { value: "offline", label: "Offline", icon: "ellipse-outline", color: Colors.offline },
];

const AUTO_REPLY_PRESETS = [
  "Hi! I'm currently unavailable. I'll get back to you as soon as possible.",
  "Thanks for reaching out! I'm in a meeting right now. Will reply shortly.",
  "I'm away from my phone. For urgent matters, please call me.",
  "Out of office until Monday. I'll respond when I'm back.",
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, logout } = useAuth();
  const [selectedPresence, setSelectedPresence] = useState<PresenceStatus>(
    user?.presence || "online",
  );
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(user?.autoReplyEnabled || false);
  const [autoReplyMessage, setAutoReplyMessage] = useState(
    user?.autoReplyMessage || AUTO_REPLY_PRESETS[0],
  );
  const [isEditingAutoReply, setIsEditingAutoReply] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [locationOn, setLocationOn] = useState(false);
  const [lastLocation, setLastLocation] = useState<UserLocation | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  useEffect(() => {
    async function loadPermissions() {
      const [notif, loc] = await Promise.all([
        areNotificationsEnabled(),
        isLocationEnabled(),
      ]);
      setNotificationsOn(notif);
      setLocationOn(loc);
      if (loc) {
        const l = await getLastLocation();
        setLastLocation(l);
      }
    }
    loadPermissions();
    loadBlockedUsers();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBlockedUsers();
    }, []),
  );

  async function loadBlockedUsers() {
    const blocked = await storage.getBlockedUsers();
    setBlockedUsers(blocked);
  }

  async function handleUnblock(phone: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Unblock User",
      "This user will be able to send you messages again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            await storage.unblockUser(phone);
            loadBlockedUsers();
          },
        },
      ],
    );
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  async function handlePresenceChange(presence: PresenceStatus) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPresence(presence);
    await updateProfile({ presence });
  }

  async function handleAutoReplyToggle(val: boolean) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAutoReplyEnabled(val);
    await updateProfile({ autoReplyEnabled: val, autoReplyMessage });
  }

  async function handleAutoReplyMessageUpdate(msg: string) {
    setAutoReplyMessage(msg);
    await updateProfile({ autoReplyMessage: msg });
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
          {user?.profilePhoto ? (
            <Image source={{ uri: user.profilePhoto }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatar, { backgroundColor: user?.avatarColor || Colors.primary }]}>
              <Text style={styles.profileAvatarText}>
                {user?.displayName?.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase() || "?"}
              </Text>
            </View>
          )}
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
          <Text style={styles.sectionTitle}>Auto Reply</Text>
          <View style={styles.optionRow}>
            <Ionicons name="chatbox-ellipses-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Auto Reply</Text>
            <Switch
              value={autoReplyEnabled}
              onValueChange={handleAutoReplyToggle}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.toggleHint}>
            Automatically reply when someone messages you
          </Text>

          {autoReplyEnabled && (
            <View style={styles.autoReplySection}>
              {isEditingAutoReply ? (
                <View style={styles.autoReplyEdit}>
                  <TextInput
                    style={styles.autoReplyInput}
                    value={autoReplyMessage}
                    onChangeText={setAutoReplyMessage}
                    multiline
                    maxLength={200}
                    placeholder="Enter your auto-reply message..."
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />
                  <Pressable
                    style={styles.autoReplySaveButton}
                    onPress={() => {
                      handleAutoReplyMessageUpdate(autoReplyMessage);
                      setIsEditingAutoReply(false);
                    }}
                  >
                    <Text style={styles.autoReplySaveText}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.autoReplyPreview}
                  onPress={() => setIsEditingAutoReply(true)}
                >
                  <Text style={styles.autoReplyPreviewText} numberOfLines={3}>
                    "{autoReplyMessage}"
                  </Text>
                  <Ionicons name="pencil" size={16} color={Colors.primary} />
                </Pressable>
              )}

              <Text style={styles.presetLabel}>Quick presets</Text>
              {AUTO_REPLY_PRESETS.map((preset, idx) => (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [
                    styles.presetRow,
                    pressed && { backgroundColor: Colors.cardElevated },
                    autoReplyMessage === preset && styles.presetRowActive,
                  ]}
                  onPress={() => {
                    setAutoReplyMessage(preset);
                    handleAutoReplyMessageUpdate(preset);
                    setIsEditingAutoReply(false);
                  }}
                >
                  <Text style={styles.presetText} numberOfLines={2}>{preset}</Text>
                  {autoReplyMessage === preset && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
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
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.optionRow}>
            <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Push Notifications</Text>
            <Switch
              value={notificationsOn}
              onValueChange={async (val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (val) {
                  const canAsk = await canAskForNotifications();
                  if (!canAsk && Platform.OS !== "web") {
                    Alert.alert(
                      "Notifications Disabled",
                      "Notification permission was previously denied. Please enable it in your device settings.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Open Settings", onPress: () => Linking.openSettings() },
                      ],
                    );
                    return;
                  }
                  const granted = await requestNotificationPermissions();
                  setNotificationsOn(granted);
                  await updateProfile({ notificationsEnabled: granted });
                  if (!granted) {
                    Alert.alert(
                      "Notifications Disabled",
                      "Please enable notifications in your device settings to receive message alerts.",
                      Platform.OS !== "web"
                        ? [
                            { text: "Cancel", style: "cancel" },
                            { text: "Open Settings", onPress: () => Linking.openSettings() },
                          ]
                        : [{ text: "OK" }],
                    );
                  }
                } else {
                  await disableNotifications();
                  setNotificationsOn(false);
                  await updateProfile({ notificationsEnabled: false });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.toggleHint}>
            Get notified when you receive new messages
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.optionRow}>
            <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Location Services</Text>
            <Switch
              value={locationOn}
              onValueChange={async (val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (val) {
                  const granted = await requestLocationPermissions();
                  setLocationOn(granted);
                  if (granted) {
                    const loc = await getLastLocation();
                    setLastLocation(loc);
                    await updateProfile({
                      locationEnabled: true,
                      lastLatitude: loc?.latitude,
                      lastLongitude: loc?.longitude,
                      locationCity: loc?.city,
                      locationRegion: loc?.region,
                    });
                  } else {
                    Alert.alert(
                      "Location Disabled",
                      "Please enable location services in your device settings.",
                      Platform.OS !== "web"
                        ? [
                            { text: "Cancel", style: "cancel" },
                            { text: "Open Settings", onPress: () => Linking.openSettings() },
                          ]
                        : [{ text: "OK" }],
                    );
                  }
                } else {
                  await disableLocation();
                  setLocationOn(false);
                  setLastLocation(null);
                  await updateProfile({
                    locationEnabled: false,
                    lastLatitude: undefined,
                    lastLongitude: undefined,
                    locationCity: undefined,
                    locationRegion: undefined,
                  });
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.toggleHint}>
            Share your location to find nearby Lekkerpreneurs
          </Text>
          {locationOn && lastLocation && (
            <View style={styles.locationInfo}>
              <Ionicons name="navigate" size={14} color={Colors.primary} />
              <Text style={styles.locationText}>
                {lastLocation.city && lastLocation.region
                  ? `${lastLocation.city}, ${lastLocation.region}`
                  : `${lastLocation.latitude.toFixed(4)}, ${lastLocation.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lekker Network</Text>
          <View style={styles.optionRow}>
            <Ionicons name="globe-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.optionLabel}>Network Access</Text>
            <Switch
              value={!!user?.lekkerNetworkAccess}
              onValueChange={async (val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await updateProfile({ lekkerNetworkAccess: val });
              }}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.toggleHint}>
            Enable to browse lekker.network directly in the app
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blocked Users</Text>
          {blockedUsers.length === 0 ? (
            <View style={styles.optionRow}>
              <Ionicons name="ban-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.optionLabel, { color: Colors.textMuted }]}>No blocked users</Text>
            </View>
          ) : (
            blockedUsers.map((bu) => (
              <View key={bu.id} style={styles.optionRow}>
                <Ionicons name="ban" size={20} color={Colors.danger} />
                <Text style={styles.optionLabel}>{bu.name}</Text>
                <Pressable
                  onPress={() => handleUnblock(bu.phone)}
                  style={styles.unblockSettingsButton}
                >
                  <Text style={styles.unblockSettingsText}>Unblock</Text>
                </Pressable>
              </View>
            ))
          )}
          <Text style={styles.toggleHint}>
            Blocked users cannot send you messages
          </Text>
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
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(18), color: Colors.text },
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
  profileAvatarText: { fontFamily: "Poppins_700Bold", fontSize: fontScale(20), color: "#fff" },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(18), color: Colors.text },
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
  toggleHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  autoReplySection: {
    marginTop: 12,
    gap: 8,
  },
  autoReplyPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  autoReplyPreviewText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
    fontStyle: "italic" as const,
  },
  autoReplyEdit: {
    gap: 8,
  },
  autoReplyInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    borderColor: Colors.primary,
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  autoReplySaveButton: {
    alignSelf: "flex-end",
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  autoReplySaveText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.background,
  },
  presetLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetRowActive: {
    borderColor: Colors.primary,
  },
  presetText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  unblockSettingsButton: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unblockSettingsText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  locationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  locationText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.primary,
  },
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
