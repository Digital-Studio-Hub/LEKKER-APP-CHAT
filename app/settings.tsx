import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Switch,
  TextInput,
  Linking,
  ActivityIndicator,
  ActionSheetIOS,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { useAuth } from "@/lib/auth-context";
import { requestNotificationPermissions, areNotificationsEnabled, disableNotifications, canAskForNotifications } from "@/lib/notifications";
import { requestLocationPermissions, isLocationEnabled, getLastLocation, disableLocation, UserLocation } from "@/lib/location";
import { storage, BlockedUser } from "@/lib/storage";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { uploadFileToStorage } from "@/client/utils/objectStorageExpo";
import { File } from "expo-file-system";

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

function getProfileImageUrl(profilePhoto: string | null | undefined): string | null {
  if (!profilePhoto) return null;
  if (profilePhoto.startsWith("http") || profilePhoto.startsWith("data:")) return profilePhoto;
  if (profilePhoto.startsWith("/objects/")) {
    const baseUrl = getApiUrl();
    return `${baseUrl}${profilePhoto.substring(1)}`;
  }
  return profilePhoto;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, logout } = useAuth();
  const [selectedPresence, setSelectedPresence] = useState<PresenceStatus>(
    (user?.presence as PresenceStatus) || "online",
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

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState(user?.firstName || "");
  const [editLastName, setEditLastName] = useState(user?.lastName || "");
  const [editUsername, setEditUsername] = useState(user?.username || "");
  const [editBio, setEditBio] = useState(user?.bio || "");
  const [editBusinessName, setEditBusinessName] = useState(user?.businessName || "");
  const [fieldError, setFieldError] = useState("");
  const [isSavingField, setIsSavingField] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSyncingLekker, setIsSyncingLekker] = useState(false);

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

  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditUsername(user.username || "");
      setEditBio(user.bio || "");
      setEditBusinessName(user.businessName || "");
    }
  }, [user?.id]);

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

  async function saveField(field: string) {
    setFieldError("");
    setIsSavingField(true);
    try {
      let updates: Record<string, any> = {};
      switch (field) {
        case "firstName":
          if (!editFirstName.trim()) { setFieldError("First name is required"); setIsSavingField(false); return; }
          updates.firstName = editFirstName.trim();
          break;
        case "lastName":
          if (!editLastName.trim()) { setFieldError("Last name is required"); setIsSavingField(false); return; }
          updates.lastName = editLastName.trim();
          break;
        case "username":
          if (editUsername.trim().length < 3) { setFieldError("Username must be at least 3 characters"); setIsSavingField(false); return; }
          if (!/^[a-zA-Z0-9_]+$/.test(editUsername.trim())) { setFieldError("Letters, numbers, and underscores only"); setIsSavingField(false); return; }
          updates.username = editUsername.trim().toLowerCase();
          break;
        case "bio":
          updates.bio = editBio.trim();
          break;
        case "businessName":
          updates.businessName = editBusinessName.trim();
          break;
      }
      await updateProfile(updates);
      setEditingField(null);
    } catch (e: any) {
      setFieldError(e.message || "Failed to save");
    } finally {
      setIsSavingField(false);
    }
  }

  function cancelEdit() {
    setFieldError("");
    setEditingField(null);
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditUsername(user.username || "");
      setEditBio(user.bio || "");
      setEditBusinessName(user.businessName || "");
    }
  }

  async function handleAvatarPress() {
    const hasPhoto = !!user?.profilePhoto;
    const options = ["Take Photo", "Choose from Library"];
    if (hasPhoto) options.push("Remove Photo");
    options.push("Cancel");

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: hasPhoto ? options.length - 2 : undefined },
        (index) => {
          if (index === 0) pickImage("camera");
          else if (index === 1) pickImage("library");
          else if (index === 2 && hasPhoto) removeProfileImage();
        },
      );
    } else {
      Alert.alert("Profile Photo", "Choose an option", [
        { text: "Take Photo", onPress: () => pickImage("camera") },
        { text: "Choose from Library", onPress: () => pickImage("library") },
        ...(hasPhoto ? [{ text: "Remove Photo", onPress: removeProfileImage, style: "destructive" as const }] : []),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  async function pickImage(source: "camera" | "library") {
    let permResult;
    if (source === "camera") {
      permResult = await ImagePicker.requestCameraPermissionsAsync();
    } else {
      permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }

    if (!permResult.granted) {
      Alert.alert("Permission Required", `Please allow ${source === "camera" ? "camera" : "photo library"} access in your settings.`);
      return;
    }

    const launchFn = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launchFn({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUploadingImage(true);

    try {
      const file = new File(asset.uri);
      const uploadURL = await uploadFileToStorage(file, "/api/objects/upload");
      const res = await apiRequest("POST", "/api/user/profile-image", { imageURL: uploadURL });
      const data = await res.json();
      if (data.user) {
        await updateProfile({ profilePhoto: data.user.profilePhoto });
      }
    } catch (e: any) {
      console.error("Image upload error:", e);
      Alert.alert("Upload Failed", "Could not upload your profile photo. Please try again.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function removeProfileImage() {
    setIsUploadingImage(true);
    try {
      const res = await apiRequest("DELETE", "/api/user/profile-image");
      const data = await res.json();
      if (data.user) {
        await updateProfile({ profilePhoto: null });
      }
    } catch (e) {
      Alert.alert("Error", "Could not remove profile photo.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSyncLekkerNetwork() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSyncingLekker(true);
    try {
      const res = await apiRequest("POST", "/api/auth/sync-lekker");
      const data = await res.json();
      if (data.matched && data.user) {
        await updateProfile(data.user);
        Alert.alert("Verified!", `Your account has been linked to ${data.user.businessName || "your Lekkerpreneur profile"} on the Lekker Network.`);
      } else {
        Alert.alert("No Match Found", data.message || "We couldn't find a matching Lekkerpreneur profile for your phone number or email. Make sure you're registered on lekker.network.");
      }
    } catch (e: any) {
      Alert.alert("Sync Failed", "Could not connect to the Lekker Network. Please try again later.");
    } finally {
      setIsSyncingLekker(false);
    }
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

  const profileImageUrl = getProfileImageUrl(user?.profilePhoto);

  function renderEditableField(label: string, fieldKey: string, value: string, setter: (v: string) => void, options?: { multiline?: boolean; maxLength?: number; keyboard?: any }) {
    const isEditing = editingField === fieldKey;
    return (
      <View style={styles.editableRow}>
        <View style={styles.editableHeader}>
          <Text style={styles.editableLabel}>{label}</Text>
          {!isEditing ? (
            <Pressable onPress={() => { setFieldError(""); setEditingField(fieldKey); }} style={styles.editButton} testID={`edit-${fieldKey}`}>
              <Ionicons name="pencil" size={16} color={Colors.primary} />
            </Pressable>
          ) : (
            <View style={styles.editActions}>
              <Pressable onPress={cancelEdit} style={styles.editActionBtn}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => saveField(fieldKey)} style={styles.editActionBtn} disabled={isSavingField}>
                {isSavingField ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="checkmark" size={18} color={Colors.primary} />}
              </Pressable>
            </View>
          )}
        </View>
        {isEditing ? (
          <>
            <TextInput
              style={[styles.editInput, options?.multiline && styles.editInputMultiline, fieldError ? styles.editInputError : null]}
              value={value}
              onChangeText={(t) => { setter(t); setFieldError(""); }}
              autoFocus
              multiline={options?.multiline}
              maxLength={options?.maxLength}
              keyboardType={options?.keyboard}
              autoCapitalize={fieldKey === "username" ? "none" : "words"}
              autoCorrect={false}
              returnKeyType={options?.multiline ? "default" : "done"}
              onSubmitEditing={options?.multiline ? undefined : () => saveField(fieldKey)}
            />
            {fieldError ? <Text style={styles.fieldErrorText}>{fieldError}</Text> : null}
          </>
        ) : (
          <Text style={styles.editableValue}>{(fieldKey === "firstName" ? user?.firstName : fieldKey === "lastName" ? user?.lastName : fieldKey === "username" ? user?.username : fieldKey === "bio" ? user?.bio : fieldKey === "businessName" ? user?.businessName : value) || "Not set"}</Text>
        )}
      </View>
    );
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <Pressable onPress={handleAvatarPress} style={styles.avatarContainer} testID="avatar-press">
            {isUploadingImage ? (
              <View style={[styles.profileAvatar, { backgroundColor: Colors.card }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : profileImageUrl ? (
              <Image source={{ uri: profileImageUrl }} style={styles.profileAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.profileAvatar, { backgroundColor: user?.avatarColor || Colors.primary }]}>
                <Text style={styles.profileAvatarText}>
                  {user?.displayName?.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text style={styles.profileDisplayName}>{user?.displayName || "User"}</Text>
          <Text style={styles.profileEmail}>{user?.email || ""}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.sectionCard}>
            {renderEditableField("First Name", "firstName", editFirstName, setEditFirstName)}
            {renderEditableField("Last Name", "lastName", editLastName, setEditLastName)}
            {renderEditableField("Username", "username", editUsername, setEditUsername)}
            {renderEditableField("Bio", "bio", editBio, setEditBio, { multiline: true, maxLength: 500 })}
            {renderEditableField("Business Name", "businessName", editBusinessName, setEditBusinessName, { maxLength: 255 })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || ""}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user?.phone || user?.phoneNumber || ""}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lekkerpreneur Verification</Text>
          <View style={styles.sectionCard}>
            {user?.isVerifiedLekkerpreneur ? (
              <>
                <View style={[styles.infoRow, { backgroundColor: "rgba(245,184,0,0.1)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }]}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  <Text style={[styles.infoLabel, { color: Colors.primary, fontWeight: "700" as const }]}>Verified Lekkerpreneur</Text>
                </View>
                {user.lekkerVerifiedAt ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Verified on</Text>
                    <Text style={styles.infoValue}>{new Date(user.lekkerVerifiedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}</Text>
                  </View>
                ) : null}
                {user.businessName ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="business-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Business</Text>
                    <Text style={styles.infoValue}>{user.businessName}</Text>
                  </View>
                ) : null}
                {user.tradingName ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="storefront-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Trading As</Text>
                    <Text style={styles.infoValue}>{user.tradingName}</Text>
                  </View>
                ) : null}
                {user.businessCategory ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="pricetag-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Category</Text>
                    <Text style={styles.infoValue}>{user.businessCategory}</Text>
                  </View>
                ) : null}
                {user.businessProvince ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Province</Text>
                    <Text style={styles.infoValue}>{user.businessProvince}</Text>
                  </View>
                ) : null}
                {user.businessWebsite ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="globe-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Website</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{user.businessWebsite}</Text>
                  </View>
                ) : null}
                {user.lekkerNetworkId ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="finger-print-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.infoLabel}>Network ID</Text>
                    <Text style={[styles.infoValue, { fontSize: 11 }]} numberOfLines={1}>{user.lekkerNetworkId}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.infoRow}>
                <Ionicons name="shield-outline" size={18} color={Colors.textMuted} />
                <Text style={[styles.infoLabel, { color: Colors.textMuted }]}>Not verified yet</Text>
              </View>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [styles.syncButton, pressed && { opacity: 0.8 }, isSyncingLekker && { opacity: 0.6 }]}
            onPress={handleSyncLekkerNetwork}
            disabled={isSyncingLekker}
            testID="sync-lekker-btn"
          >
            {isSyncingLekker ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <Ionicons name="sync" size={18} color={Colors.background} />
            )}
            <Text style={styles.syncButtonText}>
              {user?.isVerifiedLekkerpreneur ? "Re-sync with Lekker Network" : "Verify with Lekker Network"}
            </Text>
          </Pressable>
          <Text style={styles.toggleHint}>
            Match your phone or email with your lekker.network profile to verify your Lekkerpreneur status
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.sectionCard}>
            {PRESENCE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionRow, selectedPresence === option.value && styles.optionRowSelected]}
                onPress={() => handlePresenceChange(option.value)}
              >
                <Ionicons name={option.icon as any} size={14} color={option.color} />
                <Text style={styles.optionLabel}>{option.label}</Text>
                {selectedPresence === option.value && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} style={{ marginLeft: "auto" as const }} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto Reply</Text>
          <View style={styles.sectionCard}>
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
          </View>
          <Text style={styles.toggleHint}>Automatically reply when someone messages you</Text>

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
                    onPress={() => { handleAutoReplyMessageUpdate(autoReplyMessage); setIsEditingAutoReply(false); }}
                  >
                    <Text style={styles.autoReplySaveText}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.autoReplyPreview} onPress={() => setIsEditingAutoReply(true)}>
                  <Text style={styles.autoReplyPreviewText} numberOfLines={3}>"{autoReplyMessage}"</Text>
                  <Ionicons name="pencil" size={16} color={Colors.primary} />
                </Pressable>
              )}
              <Text style={styles.presetLabel}>Quick presets</Text>
              {AUTO_REPLY_PRESETS.map((preset, idx) => (
                <Pressable
                  key={idx}
                  style={({ pressed }) => [styles.presetRow, pressed && { backgroundColor: Colors.cardElevated }, autoReplyMessage === preset && styles.presetRowActive]}
                  onPress={() => { setAutoReplyMessage(preset); handleAutoReplyMessageUpdate(preset); setIsEditingAutoReply(false); }}
                >
                  <Text style={styles.presetText} numberOfLines={2}>{preset}</Text>
                  {autoReplyMessage === preset && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.sectionCard}>
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.sectionCard}>
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
                      Alert.alert("Notifications Disabled", "Notification permission was previously denied. Please enable it in your device settings.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Open Settings", onPress: () => Linking.openSettings() },
                      ]);
                      return;
                    }
                    const granted = await requestNotificationPermissions();
                    setNotificationsOn(granted);
                    await updateProfile({ notificationsEnabled: granted });
                    if (!granted) {
                      Alert.alert("Notifications Disabled", "Please enable notifications in your device settings to receive message alerts.",
                        Platform.OS !== "web" ? [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }] : [{ text: "OK" }]);
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
          </View>
          <Text style={styles.toggleHint}>Get notified when you receive new messages</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.sectionCard}>
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
                      await updateProfile({ locationEnabled: true, lastLatitude: loc?.latitude, lastLongitude: loc?.longitude, locationCity: loc?.city, locationRegion: loc?.region });
                    } else {
                      Alert.alert("Location Disabled", "Please enable location services in your device settings.",
                        Platform.OS !== "web" ? [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }] : [{ text: "OK" }]);
                    }
                  } else {
                    await disableLocation();
                    setLocationOn(false);
                    setLastLocation(null);
                    await updateProfile({ locationEnabled: false, lastLatitude: undefined, lastLongitude: undefined, locationCity: undefined, locationRegion: undefined });
                  }
                }}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
          <Text style={styles.toggleHint}>Share your location to find nearby Lekkerpreneurs</Text>
          {locationOn && lastLocation && (
            <View style={styles.locationInfo}>
              <Ionicons name="navigate" size={14} color={Colors.primary} />
              <Text style={styles.locationText}>
                {lastLocation.city && lastLocation.region ? `${lastLocation.city}, ${lastLocation.region}` : `${lastLocation.latitude.toFixed(4)}, ${lastLocation.longitude.toFixed(4)}`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lekker Network</Text>
          <View style={styles.sectionCard}>
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
          </View>
          <Text style={styles.toggleHint}>Enable to browse lekker.network directly in the app</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blocked Users</Text>
          <View style={styles.sectionCard}>
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
                  <Pressable onPress={() => handleUnblock(bu.phone)} style={styles.unblockButton}>
                    <Text style={styles.unblockText}>Unblock</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
          <Text style={styles.toggleHint}>Blocked users cannot send you messages</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && { opacity: 0.8 }]}
          onPress={handleLogout}
          testID="logout-button"
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
  content: { padding: 16, paddingBottom: 60 },
  profileSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatarContainer: {
    position: "relative" as const,
    marginBottom: 12,
  },
  profileAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden" as const,
  },
  profileAvatarText: { fontFamily: "Poppins_700Bold", fontSize: fontScale(32), color: "#fff" },
  cameraOverlay: {
    position: "absolute" as const,
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.background,
  },
  profileDisplayName: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(20), color: Colors.text },
  profileEmail: { fontFamily: "Poppins_400Regular", fontSize: fontScale(13), color: Colors.textSecondary, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: "hidden" as const,
  },
  editableRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  editableHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  editableLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textMuted },
  editableValue: { fontFamily: "Poppins_400Regular", fontSize: 15, color: Colors.text },
  editButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  editActions: { flexDirection: "row", gap: 4 },
  editActionBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  editInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
  },
  editInputMultiline: { minHeight: 80, textAlignVertical: "top" as const },
  editInputError: { borderColor: Colors.danger },
  fieldErrorText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.danger, marginTop: 4, paddingLeft: 4 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  infoLabel: { fontFamily: "Poppins_400Regular", fontSize: 15, color: Colors.text, flex: 1 },
  infoValue: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  optionRowSelected: { backgroundColor: Colors.cardElevated },
  optionLabel: { fontFamily: "Poppins_400Regular", fontSize: 15, color: Colors.text, flex: 1 },
  optionValue: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
  toggleHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  autoReplySection: { marginTop: 12, gap: 8 },
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
  autoReplyPreviewText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, fontStyle: "italic" as const },
  autoReplyEdit: { gap: 8 },
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
  autoReplySaveButton: { alignSelf: "flex-end" as const, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  autoReplySaveText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.background },
  presetLabel: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textMuted, marginTop: 8, paddingHorizontal: 4 },
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
  presetRowActive: { borderColor: Colors.primary },
  presetText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1 },
  unblockButton: { backgroundColor: Colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  unblockText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text },
  locationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  locationText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.primary },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
    marginTop: 10,
    marginHorizontal: 4,
  },
  syncButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.background },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
  },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.danger },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center" as const,
    marginTop: 20,
    marginBottom: 20,
  },
});
