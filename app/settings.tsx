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
import { requestNotificationPermissions, areNotificationsEnabled, disableNotifications, canAskForNotifications, registerDevicePushToken } from "@/lib/notifications";
import { requestLocationPermissions, isLocationEnabled, getLastLocation, disableLocation, UserLocation } from "@/lib/location";
import { fetchBlockedUsers, unblockUserServer, type BlockedUserRow } from "@/lib/safety-api";
import { ABUSE_CONTACT_EMAIL, COMMUNITY_GUIDELINES_URL, PRIVACY_POLICY_URL } from "@/constants/safety";
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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRow[]>([]);

  type LinkedEmail = { id: string; email: string; isPrimary: boolean; isVerified: boolean; verifiedAt: string | null };
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [addEmailError, setAddEmailError] = useState("");
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [verifyError, setVerifyError] = useState("");

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
    loadLinkedEmails();
  }, []);

  async function loadLinkedEmails() {
    setIsLoadingEmails(true);
    try {
      const res = await apiRequest("GET", "/api/auth/emails");
      if (res.ok) {
        const data = await res.json();
        setLinkedEmails(data.emails || []);
      }
    } catch (e) {
      console.error("Failed to load linked emails:", e);
    } finally {
      setIsLoadingEmails(false);
    }
  }

  async function handleAddEmail() {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      setAddEmailError("Enter a valid email address");
      return;
    }
    setIsAddingEmail(true);
    setAddEmailError("");
    try {
      const res = await apiRequest("POST", "/api/auth/add-email", { email: newEmail.trim() });
      const data = await res.json();
      if (!res.ok) { setAddEmailError(data.message || "Failed to add email"); return; }
      setPendingEmailId(data.emailId);
      setNewEmail("");
      await loadLinkedEmails();
    } catch (e) {
      setAddEmailError("Something went wrong. Try again.");
    } finally {
      setIsAddingEmail(false);
    }
  }

  async function handleVerifyEmail(emailId: string) {
    if (!verifyCode.trim() || verifyCode.length !== 6) {
      setVerifyError("Enter the 6-digit code sent to your email");
      return;
    }
    setIsVerifyingEmail(true);
    setVerifyError("");
    try {
      const res = await apiRequest("POST", "/api/auth/verify-linked-email", { emailId, code: verifyCode.trim() });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.message || "Invalid code"); return; }
      setPendingEmailId(null);
      setVerifyCode("");
      Alert.alert("Verified!", "Email address verified successfully.");
      await loadLinkedEmails();
    } catch (e) {
      setVerifyError("Something went wrong. Try again.");
    } finally {
      setIsVerifyingEmail(false);
    }
  }

  async function handleResendCode(emailId: string) {
    try {
      const res = await apiRequest("POST", "/api/auth/resend-linked-email-code", { emailId });
      const data = await res.json();
      Alert.alert(res.ok ? "Code Sent" : "Error", data.message || (res.ok ? "Verification code resent." : "Failed to resend code."));
    } catch (e) {
      Alert.alert("Error", "Failed to resend code.");
    }
  }

  async function handleRemoveEmail(emailId: string, email: string) {
    Alert.alert("Remove Email", `Remove ${email} from your account?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await apiRequest("DELETE", `/api/auth/emails/${emailId}`);
            const data = await res.json();
            if (!res.ok) { Alert.alert("Error", data.message || "Could not remove email"); return; }
            await loadLinkedEmails();
          } catch (e) {
            Alert.alert("Error", "Failed to remove email.");
          }
        },
      },
    ]);
  }

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
    const blocked = await fetchBlockedUsers();
    setBlockedUsers(blocked);
  }

  async function handleUnblock(userId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Unblock User",
      "This user will be able to send you messages again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            await unblockUserServer(userId);
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

  async function handleDeleteAccount() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data including messages, posts, and profile information. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              `Deleting your account will permanently remove all data for ${user?.firstName} ${user?.lastName}. You will not be able to recover it.`,
              [
                { text: "Go Back", style: "cancel" },
                {
                  text: "Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await apiRequest("DELETE", "/api/auth/account");
                      await logout();
                      router.replace("/");
                    } catch (err: any) {
                      Alert.alert("Error", err.message || "Failed to delete account. Please try again.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
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
            <View style={styles.editableRow}>
              <View style={styles.editableHeader}>
                <Text style={styles.editableLabel}>Username</Text>
                <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
              </View>
              <Text style={styles.editableValue}>@{user?.username || "Not set"}</Text>
            </View>
            {renderEditableField("Bio", "bio", editBio, setEditBio, { multiline: true, maxLength: 500 })}
            <View style={styles.editableRow}>
              <View style={styles.editableHeader}>
                <Text style={styles.editableLabel}>Business Name</Text>
                <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
              </View>
              <Text style={styles.editableValue}>{user?.businessName || "Not set"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Phone</Text>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                <Text style={styles.infoValue}>{user?.phone || user?.phoneNumber || ""}</Text>
                {user?.phoneVerified
                  ? <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                  : <Ionicons name="alert-circle-outline" size={14} color={Colors.textMuted} />}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Linked Emails</Text>
          <View style={styles.sectionCard}>
            {isLoadingEmails ? (
              <View style={styles.infoRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.infoLabel, { color: Colors.textMuted }]}>Loading emails…</Text>
              </View>
            ) : linkedEmails.length === 0 ? (
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
                <Text style={[styles.infoLabel, { color: Colors.textMuted }]}>No emails linked</Text>
              </View>
            ) : (
              linkedEmails.map((em, idx) => (
                <View key={em.id}>
                  {idx > 0 && <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />}
                  <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { fontSize: 13 }]} numberOfLines={1}>{em.email}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        {em.isPrimary && (
                          <View style={{ backgroundColor: "rgba(245,184,0,0.15)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.primary }}>Primary</Text>
                          </View>
                        )}
                        {em.isVerified ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: "#4CAF50" }}>Verified</Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="alert-circle-outline" size={12} color={Colors.textMuted} />
                            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textMuted }}>Unverified</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {!em.isVerified && (
                        <Pressable
                          onPress={() => setPendingEmailId(pendingEmailId === em.id ? null : em.id)}
                          style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                          <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.background }}>Verify</Text>
                        </Pressable>
                      )}
                      {!em.isPrimary && (
                        <Pressable
                          onPress={() => handleRemoveEmail(em.id, em.email)}
                          style={{ backgroundColor: "rgba(255,59,48,0.1)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                        >
                          <Ionicons name="close" size={14} color={Colors.danger} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                  {pendingEmailId === em.id && !em.isVerified && (
                    <View style={{ paddingHorizontal: 8, paddingBottom: 8, paddingTop: 4 }}>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 8 }}>
                        Enter the 6-digit code sent to {em.email}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextInput
                          style={{ flex: 1, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontFamily: "Poppins_400Regular", fontSize: 16, letterSpacing: 4 }}
                          placeholder="000000"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="number-pad"
                          maxLength={6}
                          value={verifyCode}
                          onChangeText={setVerifyCode}
                        />
                        <Pressable
                          onPress={() => handleVerifyEmail(em.id)}
                          disabled={isVerifyingEmail}
                          style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                        >
                          {isVerifyingEmail ? <ActivityIndicator size="small" color={Colors.background} /> : <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.background }}>Confirm</Text>}
                        </Pressable>
                      </View>
                      {verifyError ? <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.danger, marginTop: 4 }}>{verifyError}</Text> : null}
                      <Pressable onPress={() => handleResendCode(em.id)} style={{ marginTop: 8 }}>
                        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary }}>Didn't receive it? <Text style={{ color: Colors.primary }}>Resend code</Text></Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}

            {showAddEmail ? (
              <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 }}>
                {linkedEmails.length > 0 && <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: 10 }} />}
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginBottom: 8 }}>Add a new email address</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: addEmailError ? Colors.danger : Colors.border, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontFamily: "Poppins_400Regular", fontSize: 14 }}
                    placeholder="email@example.com"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={newEmail}
                    onChangeText={setNewEmail}
                  />
                  <Pressable
                    onPress={handleAddEmail}
                    disabled={isAddingEmail}
                    style={{ backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
                  >
                    {isAddingEmail ? <ActivityIndicator size="small" color={Colors.background} /> : <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.background }}>Add</Text>}
                  </Pressable>
                </View>
                {addEmailError ? <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.danger, marginTop: 4 }}>{addEmailError}</Text> : null}
                <Pressable onPress={() => { setShowAddEmail(false); setNewEmail(""); setAddEmailError(""); }} style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted }}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddEmail(true); setAddEmailError(""); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 4, marginTop: linkedEmails.length > 0 ? 4 : 0 }}
              >
                {linkedEmails.length > 0 && <View style={{ height: 1, backgroundColor: Colors.border, position: "absolute", top: 0, left: 0, right: 0 }} />}
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.primary }}>Add email address</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.toggleHint}>Link multiple emails to log in from any of them. Search others by any linked email.</Text>
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
          <Text style={styles.sectionTitle}>Safety</Text>
          <View style={styles.sectionCard}>
            <Pressable
              style={styles.optionRow}
              onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.optionLabel}>Community guidelines</Text>
              <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => Linking.openURL(`mailto:${ABUSE_CONTACT_EMAIL}?subject=Lekker%20Chat%20safety%20report`)}
            >
              <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.optionLabel}>Report abuse</Text>
              <Text style={styles.optionValue} numberOfLines={1}>{ABUSE_CONTACT_EMAIL}</Text>
            </Pressable>
          </View>
          <Text style={styles.toggleHint}>
            Flag messages in any chat (long-press) or use the flag icon in the chat header. Reports are reviewed within 24 hours.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data &amp; privacy</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Lekker Chat collects your account details (name, phone, email), messages you send, profile information, and optional location when you enable it. Data is stored on secure servers and used to provide messaging, directory, and AI assistant features.
            </Text>
            <Text style={[styles.infoText, { marginTop: 8 }]}>
              <Text style={styles.infoTextBold}>Contacts: </Text>
              Your full address book is never uploaded. We may read contacts on your device to help you find friends (matching happens locally). If you share a contact card in a chat, that contact&apos;s name and phone number are uploaded to our servers and delivered to conversation participants only.
            </Text>
            <Text style={[styles.infoText, { marginTop: 8 }]}>
              We do not sell your personal data. Limited sharing occurs with service providers (SMS/email delivery, cloud hosting, AI processing) only to operate the app. We do not track you across other companies&apos; apps or websites.
            </Text>
          </View>
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
                    if (granted) await registerDevicePushToken();
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
                  <Pressable onPress={() => handleUnblock(bu.blockedUserId)} style={styles.unblockButton}>
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

        <Pressable
          style={({ pressed }) => [styles.deleteAccountButton, pressed && { opacity: 0.8 }]}
          onPress={handleDeleteAccount}
          testID="delete-account-button"
        >
          <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            style={({ pressed }) => [styles.legalLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDivider}>·</Text>
          <Pressable
            onPress={() => Linking.openURL("https://lekker.network/terms")}
            style={({ pressed }) => [styles.legalLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.legalLinkText}>Terms & Conditions</Text>
          </Pressable>
        </View>

        <Text style={styles.version}>Lekker Chat v1.0.0 · Powered by Lekker Network</Text>
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
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  infoTextBold: {
    fontFamily: "Poppins_600SemiBold",
    color: Colors.text,
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
  deleteAccountButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  deleteAccountText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textMuted,
  },
  version: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center" as const,
    marginTop: 8,
    marginBottom: 20,
  },
  legalLinks: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginTop: 20,
    gap: 8,
  },
  legalLink: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  legalLinkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.primary,
  },
  legalDivider: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
});
