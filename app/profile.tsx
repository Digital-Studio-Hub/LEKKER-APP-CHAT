import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
            <View style={[styles.avatar, { backgroundColor: user?.avatarColor || Colors.primary }]}>
              <Text style={styles.avatarText}>
                {user?.displayName?.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase() || "?"}
              </Text>
            </View>

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
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 32, color: "#fff" },
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
