import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { storage, FeedPost } from "@/lib/storage";
import { fetchDirectoryCached } from "@/lib/query-client";
import { fetchUserProfile, getPresenceColor, getPresenceLabel } from "@/lib/chat-api";

interface UserInfo {
  name: string;
  phone: string;
  avatarColor: string;
  businessName?: string;
  serviceType?: string;
  location?: string;
  province?: string;
  bio?: string;
  isLekkerpreneur: boolean;
  isVerified?: boolean;
  memberSince?: string;
  presence?: string | null;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function UserProfileScreen() {
  const { id, name, avatarColor } = useLocalSearchParams<{
    id: string;
    name?: string;
    avatarColor?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    loadUserInfo();
    loadUserPosts();
  }, [id]);

  async function loadUserInfo() {
    setLoading(true);
    let info: UserInfo = {
      name: name || "User",
      phone: id || "",
      avatarColor: avatarColor || Colors.primary,
      isLekkerpreneur: false,
    };

    try {
      const profile = await fetchUserProfile(id || "");
      if (profile) {
        const fullName = `${profile.firstName} ${profile.lastName}`.trim() || profile.username;
        info = {
          ...info,
          name: fullName,
          phone: profile.phone || info.phone,
          avatarColor: profile.avatarColor || info.avatarColor,
          businessName: profile.businessName || undefined,
          bio: profile.bio || undefined,
          isVerified: profile.isVerifiedLekkerpreneur,
          isLekkerpreneur: profile.isVerifiedLekkerpreneur,
          presence: profile.presence,
          memberSince: profile.createdAt,
        };
      }
    } catch {}

    try {
      const data = await fetchDirectoryCached();
      const entry = data.entries.find((e: any) => e.id === id || e.phone === id);
      if (entry) {
        info = {
          ...info,
          serviceType: entry.serviceType,
          location: entry.location,
          province: entry.province,
          isLekkerpreneur: true,
        };
      }
    } catch {}

    setUserInfo(info);
    setLoading(false);
  }

  async function loadUserPosts() {
    const allPosts = await storage.getFeedPosts();
    const userPosts = allPosts.filter((p) => p.authorId === id);
    setPosts(userPosts);
  }

  async function handleStartChat() {
    if (!userInfo || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const convs = await storage.getConversations();
    let conv = convs.find((c) => c.contactId === id);
    if (!conv) {
      conv = await storage.addConversation(userInfo.name, id, userInfo.avatarColor);
    }
    router.push({ pathname: "/chat/[id]", params: { id: conv.id } });
  }

  const initials = (userInfo?.name || name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
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
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.profileSection}>
            <View style={[styles.avatar, { backgroundColor: userInfo?.avatarColor || Colors.primary }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.name}>{userInfo?.name}</Text>
              {userInfo?.isLekkerpreneur && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: getPresenceColor(userInfo?.presence) }} />
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: getPresenceColor(userInfo?.presence) }}>
                {getPresenceLabel(userInfo?.presence)}
              </Text>
            </View>

            {userInfo?.businessName && (
              <Text style={styles.businessName}>{userInfo.businessName}</Text>
            )}

            {userInfo?.bio && (
              <Text style={styles.bio}>{userInfo.bio}</Text>
            )}

            {(userInfo?.location || userInfo?.province) && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.infoText}>
                  {[userInfo.location, userInfo.province].filter(Boolean).join(", ")}
                </Text>
              </View>
            )}

            {userInfo?.isVerified && (
              <View style={[styles.infoRow, { backgroundColor: "rgba(245,184,0,0.1)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 4 }]}>
                <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
                <Text style={[styles.infoText, { color: Colors.primary, fontWeight: "600" as const }]}>CIPC Verified Business</Text>
              </View>
            )}

            {userInfo?.memberSince && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.infoText}>Member since {new Date(userInfo.memberSince).toLocaleDateString("en-ZA", { year: "numeric", month: "long" })}</Text>
              </View>
            )}

            {userInfo?.serviceType && (
              <View style={styles.infoRow}>
                <Ionicons name="briefcase-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.infoText}>{userInfo.serviceType}</Text>
              </View>
            )}

            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.infoText}>{userInfo?.phone}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.chatButton, pressed && { opacity: 0.8 }]}
              onPress={handleStartChat}
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.background} />
              <Text style={styles.chatButtonText}>Send Message</Text>
            </Pressable>

            <Text style={styles.postsTitle}>
              {posts.length > 0 ? "Recent Posts" : "Posts"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.postCard}
            onPress={() => router.push({ pathname: "/post-comments", params: { postId: item.id } })}
          >
            <Text style={styles.postContent}>{item.content}</Text>
            {item.mediaUrl && (
              <View style={styles.postMediaPlaceholder}>
                <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.postMeta}>
              <Text style={styles.postTime}>{formatTimeAgo(item.createdAt)}</Text>
              <View style={styles.postStats}>
                <Ionicons name="heart" size={12} color={Colors.textMuted} />
                <Text style={styles.postStatText}>{item.likes.length}</Text>
                <Ionicons name="chatbubble" size={12} color={Colors.textMuted} />
                <Text style={styles.postStatText}>{item.comments.length}</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 84 } : undefined,
        ]}
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
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 20 },
  profileSection: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 36, color: "#fff" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  name: { fontFamily: "Poppins_700Bold", fontSize: 24, color: Colors.text },
  businessName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: Colors.primary,
    marginBottom: 8,
  },
  bio: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  infoText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  chatButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  postsTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    alignSelf: "flex-start",
    marginTop: 24,
    marginBottom: 12,
  },
  postCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  postContent: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  postMediaPlaceholder: {
    height: 40,
    backgroundColor: Colors.cardElevated,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  postMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  postTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  postStats: { flexDirection: "row", alignItems: "center", gap: 6 },
  postStatText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
});
