import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { fetchFeedPost, addFeedComment, type FeedComment, type FeedPost } from "@/lib/feed-api";
import { containsBlockedContent, CONTENT_FILTER_MESSAGE } from "@shared/content-filter";
import { useAgeGate } from "@/lib/age-gate-context";
import { SocialAccessBlocked } from "@/components/SocialAccessBlocked";
import { blockUserServer, confirmBlockUser, promptContentReport, promptReportOrBlock } from "@/lib/safety-api";

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
  const { socialMediaAllowed } = useAgeGate();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [missing, setMissing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!socialMediaAllowed) return;
    loadPost();
  }, [postId, socialMediaAllowed]);

  async function loadPost() {
    if (!postId) {
      setMissing(true);
      return;
    }
    const found = await fetchFeedPost(postId);
    if (found) {
      setPost(found);
      setMissing(false);
    } else {
      setPost(null);
      setMissing(true);
    }
  }

  function reportPost(target: FeedPost) {
    promptContentReport({
      reportType: "post",
      reportedUserId: target.authorId,
      messageId: target.id,
      subjectLabel: "post",
      details: target.content.slice(0, 500),
    });
  }

  function reportComment(comment: FeedComment) {
    promptContentReport({
      reportType: "comment",
      reportedUserId: comment.authorId,
      messageId: comment.id,
      subjectLabel: "comment",
      details: comment.content.slice(0, 500),
    });
  }

  function blockPerson(personId: string, name: string) {
    confirmBlockUser(name, async () => {
      const ok = await blockUserServer(personId);
      if (!ok) {
        Alert.alert("Couldn't block", "Please try again.");
        return;
      }
      if (!post || personId === post.authorId) {
        router.back();
        return;
      }
      setPost({
        ...post,
        comments: post.comments.filter((comment) => comment.authorId !== personId),
      });
    });
  }

  function openPostSafety(target: FeedPost) {
    if (!user || target.authorId === user.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    promptReportOrBlock({
      title: target.authorName,
      reportLabel: "Report post",
      blockLabel: "Block author",
      onReport: () => reportPost(target),
      onBlock: () => blockPerson(target.authorId, target.authorName),
    });
  }

  function openCommentSafety(comment: FeedComment) {
    if (!user || comment.authorId === user.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    promptReportOrBlock({
      title: comment.authorName,
      reportLabel: "Report comment",
      blockLabel: "Block user",
      onReport: () => reportComment(comment),
      onBlock: () => blockPerson(comment.authorId, comment.authorName),
    });
  }

  if (!socialMediaAllowed) {
    return <SocialAccessBlocked feature="Commenting on posts" />;
  }

  async function handleComment() {
    if (!commentText.trim() || !user || !postId) return;
    if (containsBlockedContent(commentText.trim())) {
      Alert.alert("Not allowed", CONTENT_FILTER_MESSAGE);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addFeedComment(postId, commentText.trim());
    setCommentText("");
    await loadPost();
  }

  if (!post) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        {missing ? (
          <Text style={styles.emptyText}>This post is unavailable.</Text>
        ) : (
          <>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>
              Loading...
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comments</Text>

      <View style={styles.originalPost}>
        <View style={styles.commentHeader}>
          <Text style={styles.postAuthor}>{post.authorName}</Text>
          {user && post.authorId !== user.id && (
            <Pressable
              onPress={() => openPostSafety(post)}
              style={styles.safetyButton}
              accessibilityLabel="Post options"
              hitSlop={8}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Text style={styles.postContent}>{post.content}</Text>
      </View>

      <FlatList
        data={post.comments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{item.authorName}</Text>
              <View style={styles.commentMeta}>
                <Text style={styles.commentTime}>{formatTimeAgo(item.createdAt)}</Text>
                {user && item.authorId !== user.id && (
                  <Pressable
                    onPress={() => openCommentSafety(item)}
                    style={styles.safetyButton}
                    accessibilityLabel="Comment options"
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
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
  postAuthor: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.primary, marginBottom: 4, flex: 1 },
  postContent: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, lineHeight: 22 },
  commentsList: { paddingHorizontal: 16 },
  comment: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  safetyButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
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
