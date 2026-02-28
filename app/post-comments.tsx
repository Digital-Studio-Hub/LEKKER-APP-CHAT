import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, FeedPost, FeedComment } from "@/lib/storage";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function PostCommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadPost();
  }, [postId]);

  async function loadPost() {
    const posts = await storage.getFeedPosts();
    const found = posts.find((p) => p.id === postId);
    if (found) setPost(found);
  }

  async function handleComment() {
    if (!commentText.trim() || !user || !postId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storage.addComment(postId, user.id, user.displayName, commentText.trim());
    setCommentText("");
    await loadPost();
  }

  if (!post) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>
          Loading...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comments</Text>

      <View style={styles.originalPost}>
        <Text style={styles.postAuthor}>{post.authorName}</Text>
        <Text style={styles.postContent}>{post.content}</Text>
      </View>

      <FlatList
        data={post.comments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{item.authorName}</Text>
              <Text style={styles.commentTime}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
            <Text style={styles.commentContent}>{item.content}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No comments yet. Be the first!</Text>
          </View>
        }
        contentContainerStyle={styles.commentsList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.textMuted}
          value={commentText}
          onChangeText={setCommentText}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={() => {
            handleComment();
            inputRef.current?.focus();
          }}
          style={[styles.sendButton, !commentText.trim() && { opacity: 0.4 }]}
          disabled={!commentText.trim()}
        >
          <Ionicons name="send" size={16} color={Colors.background} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.text,
    textAlign: "center",
    paddingVertical: 16,
  },
  originalPost: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  postAuthor: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary, marginBottom: 4 },
  postContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22 },
  commentsList: { paddingHorizontal: 16 },
  comment: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  commentAuthor: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textMuted },
  commentContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  emptyState: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
