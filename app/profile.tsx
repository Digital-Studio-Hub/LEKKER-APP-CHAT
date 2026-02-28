import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  Alert,
  ActionSheetIOS,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, FeedPost } from "@/lib/storage";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState(user?.status || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameText, setNameText] = useState(user?.displayName || "");
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useFocusEffect(
    useCallback(() => {
      loadMyPosts();
    }, [user?.id]),
  );

  async function loadMyPosts() {
    if (!user) return;
    const allPosts = await storage.getFeedPosts();
    setMyPosts(allPosts.filter((p) => p.authorId === user.id));
  }

  async function saveStatus() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateProfile({ status: statusText.trim() });
    setIsEditingStatus(false);
  }

  async function saveName() {
    if (nameText.trim().length < 2) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateProfile({ displayName: nameText.trim() });
    setIsEditingName(false);
  }

  async function pickImage(useCamera: boolean) {
    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Camera access is required to take a photo.");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Photo library access is required to choose a photo.");
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
          });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await updateProfile({ profilePhoto: uri });
      }
    } catch (e) {
      console.error("Image pick error:", e);
      Alert.alert("Error", "Could not pick image. Please try again.");
    }
  }

  function handleAvatarPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === "ios") {
      const options = user?.profilePhoto
        ? ["Take Photo", "Choose from Library", "Remove Photo", "Cancel"]
        : ["Take Photo", "Choose from Library", "Cancel"];
      const cancelIndex = options.length - 1;
      const destructiveIndex = user?.profilePhoto ? 2 : undefined;

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (buttonIndex) => {
          if (buttonIndex === 0) pickImage(true);
          else if (buttonIndex === 1) pickImage(false);
          else if (buttonIndex === 2 && user?.profilePhoto) {
            updateProfile({ profilePhoto: undefined });
          }
        },
      );
    } else {
      Alert.alert("Profile Photo", "Choose an option", [
        { text: "Take Photo", onPress: () => pickImage(true) },
        { text: "Choose from Library", onPress: () => pickImage(false) },
        ...(user?.profilePhoto
          ? [{ text: "Remove Photo", style: "destructive" as const, onPress: () => updateProfile({ profilePhoto: undefined }) }]
          : []),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  const initials = user?.displayName
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "?";

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={myPosts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.profileSection}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarContainer}>
              {user?.profilePhoto ? (
                <Image source={{ uri: user.profilePhoto }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: user?.avatarColor || Colors.primary }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            </Pressable>

            {isEditingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={nameText}
                  onChangeText={setNameText}
                  autoFocus
                  selectTextOnFocus
                />
                <Pressable onPress={saveName} style={styles.saveIcon}>
                  <Ionicons name="checkmark" size={22} color={Colors.success} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setIsEditingName(true)}>
                <Text style={styles.name}>{user?.displayName}</Text>
              </Pressable>
            )}

            <Text style={styles.phone}>{user?.phoneNumber}</Text>

            {isEditingStatus ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={statusText}
                  onChangeText={setStatusText}
                  autoFocus
                  placeholder="Set a status..."
                  placeholderTextColor={Colors.textMuted}
                />
                <Pressable onPress={saveStatus} style={styles.saveIcon}>
                  <Ionicons name="checkmark" size={22} color={Colors.success} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setIsEditingStatus(true)}>
                <Text style={styles.status}>{user?.status || "Tap to set status"}</Text>
              </Pressable>
            )}

            <Text style={styles.postsTitle}>Your Posts</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.postCard}>
            <Text style={styles.postContent}>{item.content}</Text>
            <View style={styles.postMeta}>
              <Text style={styles.postTime}>{formatTimeAgo(item.createdAt)}</Text>
              <View style={styles.postStats}>
                <Ionicons name="heart" size={12} color={Colors.textMuted} />
                <Text style={styles.postStatText}>{item.likes.length}</Text>
                <Ionicons name="chatbubble" size={12} color={Colors.textMuted} />
                <Text style={styles.postStatText}>{item.comments.length}</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
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
  listContent: { padding: 20 },
  profileSection: { alignItems: "center", marginBottom: 32 },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 36, color: "#fff" },
  cameraIcon: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.background,
  },
  name: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.text, marginBottom: 4 },
  phone: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted, marginBottom: 8 },
  status: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, fontStyle: "italic" as const },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  editInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 16,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    minWidth: 200,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  postsTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    alignSelf: "flex-start",
    marginTop: 32,
    marginBottom: 12,
  },
  postCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  postContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22, marginBottom: 8 },
  postMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  postTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  postStats: { flexDirection: "row", alignItems: "center", gap: 6 },
  postStatText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
});
