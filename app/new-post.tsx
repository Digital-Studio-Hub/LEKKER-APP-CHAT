import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/storage";

export default function NewPostScreen() {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  async function handlePost() {
    if (!content.trim() || !user) return;

    setIsPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const post = await storage.createFeedPost(
        user.id,
        user.displayName,
        user.avatarColor,
        content.trim(),
      );

      if (post === null) {
        const msg = "You've already posted similar content in the last 24 hours.";
        if (Platform.OS === "web") {
          alert(msg);
        } else {
          Alert.alert("Duplicate Content", msg);
        }
        setIsPosting(false);
        return;
      }

      router.back();
    } catch (e) {
      console.error(e);
    } finally {
      setIsPosting(false);
    }
  }

  const charCount = content.length;
  const maxChars = 500;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>New Post</Text>
        <Pressable
          style={({ pressed }) => [
            styles.postButton,
            pressed && { opacity: 0.8 },
            (!content.trim() || isPosting) && styles.postButtonDisabled,
          ]}
          onPress={handlePost}
          disabled={!content.trim() || isPosting}
        >
          <Text style={styles.postButtonText}>
            {isPosting ? "Posting..." : "Post"}
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="What's happening in your business?"
        placeholderTextColor={Colors.textMuted}
        value={content}
        onChangeText={(text) => setContent(text.substring(0, maxChars))}
        multiline
        autoFocus
        textAlignVertical="top"
      />

      <View style={styles.footer}>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.infoText}>Posts expire after 24 hours</Text>
        </View>
        <Text style={[styles.charCount, charCount > maxChars * 0.9 && { color: Colors.danger }]}>
          {charCount}/{maxChars}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.text,
  },
  postButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  postButtonDisabled: { opacity: 0.4 },
  postButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  input: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  charCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
