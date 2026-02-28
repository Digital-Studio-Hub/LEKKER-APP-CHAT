import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  RefreshControl,
  Image,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, FeedPost } from "@/lib/storage";

function Avatar({ name, color, size = 40, photo }: { name: string; color: string; size?: number; photo?: string }) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const initials = name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Poppins_600SemiBold", color: "#fff", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
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

function PostCard({
  post,
  userId,
  userPhoto,
  onLike,
  onComment,
  onShare,
}: {
  post: FeedPost;
  userId: string;
  userPhoto?: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const isLiked = post.likes.includes(userId);
  const photo = post.authorId === userId ? userPhoto : undefined;

  return (
    <View style={postStyles.card}>
      <View style={postStyles.header}>
        <Avatar name={post.authorName} color={post.authorAvatarColor} size={42} photo={photo} />
        <View style={postStyles.headerInfo}>
          <Text style={postStyles.authorName}>{post.authorName}</Text>
          <Text style={postStyles.timestamp}>{formatTimeAgo(post.createdAt)}</Text>
        </View>
        {post.shares.length > 0 && (
          <View style={postStyles.sharedBadge}>
            <Ionicons name="repeat" size={12} color={Colors.primary} />
            <Text style={postStyles.sharedText}>Shared</Text>
          </View>
        )}
      </View>

      <Text style={postStyles.content}>{post.content}</Text>

      <View style={postStyles.stats}>
        {post.likes.length > 0 && (
          <Text style={postStyles.statText}>{post.likes.length} likes</Text>
        )}
        {post.comments.length > 0 && (
          <Text style={postStyles.statText}>{post.comments.length} comments</Text>
        )}
        {post.shares.length > 0 && (
          <Text style={postStyles.statText}>{post.shares.length} shares</Text>
        )}
      </View>

      <View style={postStyles.actions}>
        <Pressable onPress={onLike} style={postStyles.actionButton}>
          <Ionicons name={isLiked ? "heart" : "heart-outline"} size={22} color={isLiked ? "#FF3B30" : Colors.textSecondary} />
          <Text style={[postStyles.actionText, isLiked && { color: "#FF3B30" }]}>
            {post.likes.length || ""}
          </Text>
        </Pressable>
        <Pressable onPress={onComment} style={postStyles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color={Colors.textSecondary} />
          <Text style={postStyles.actionText}>{post.comments.length || ""}</Text>
        </Pressable>
        <Pressable onPress={onShare} style={postStyles.actionButton}>
          <Ionicons name="repeat-outline" size={22} color={Colors.textSecondary} />
          <Text style={postStyles.actionText}>{post.shares.length || ""}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const postStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  headerInfo: { flex: 1 },
  authorName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  timestamp: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  sharedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.cardElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sharedText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.primary },
  content: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  stats: {
    flexDirection: "row",
    gap: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  statText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 10,
  },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4 },
  actionText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
});

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, []),
  );

  async function loadPosts() {
    const feedPosts = await storage.getFeedPosts();
    setPosts(feedPosts);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }

  async function handleLike(postId: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storage.toggleLike(postId, user.id);
    await loadPosts();
  }

  async function handleShare(postId: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await storage.sharePost(postId, user.id);
    await loadPosts();
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/new-post");
          }}
          style={styles.newPostButton}
        >
          <Ionicons name="add" size={22} color={Colors.background} />
        </Pressable>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            userId={user?.id || ""}
            userPhoto={user?.profilePhoto}
            onLike={() => handleLike(item.id)}
            onComment={() => router.push({ pathname: "/post-comments", params: { postId: item.id } })}
            onShare={() => handleShare(item.id)}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 84 } : undefined,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptySubtitle}>
              Share what you're working on - posts last 24 hours
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.8 }]}
              onPress={() => router.push("/new-post")}
            >
              <Ionicons name="create-outline" size={18} color={Colors.background} />
              <Text style={styles.emptyButtonText}>Create Post</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 28, color: Colors.text },
  newPostButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingHorizontal: 16 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 20, color: Colors.text, marginTop: 8 },
  emptySubtitle: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", paddingHorizontal: 40 },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  emptyButtonText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.background },
});
