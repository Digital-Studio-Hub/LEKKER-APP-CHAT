import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Image,
  ActionSheetIOS,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { createFeedPost } from "@/lib/feed-api";
import { containsBlockedContent, CONTENT_FILTER_MESSAGE } from "@shared/content-filter";

export default function NewPostScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isPickingMedia, setIsPickingMedia] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  async function pickMedia(useCamera: boolean, type: "images" | "videos") {
    try {
      setIsPickingMedia(true);

      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Camera access is required.");
          setIsPickingMedia(false);
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Photo library access is required.");
          setIsPickingMedia(false);
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: [type],
            allowsEditing: true,
            quality: 0.7,
            base64: type === "images",
            videoMaxDuration: 60,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: [type],
            allowsEditing: true,
            quality: 0.7,
            base64: type === "images",
            videoMaxDuration: 60,
          });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const isVideo = asset.type === "video";
        const uri = !isVideo && asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setMediaUri(uri);
        setMediaType(isVideo ? "video" : "image");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      console.error("Media pick error:", e);
      Alert.alert("Error", "Could not pick media. Please try again.");
    } finally {
      setIsPickingMedia(false);
    }
  }

  function handleAddMedia() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Take Photo", "Take Video", "Choose Photo", "Choose Video", "Cancel"],
          cancelButtonIndex: 4,
        },
        (idx) => {
          if (idx === 0) pickMedia(true, "images");
          else if (idx === 1) pickMedia(true, "videos");
          else if (idx === 2) pickMedia(false, "images");
          else if (idx === 3) pickMedia(false, "videos");
        },
      );
    } else {
      Alert.alert("Add Media", "Choose an option", [
        { text: "Take Photo", onPress: () => pickMedia(true, "images") },
        { text: "Take Video", onPress: () => pickMedia(true, "videos") },
        { text: "Choose Photo", onPress: () => pickMedia(false, "images") },
        { text: "Choose Video", onPress: () => pickMedia(false, "videos") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  function removeMedia() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMediaUri(null);
    setMediaType(null);
  }

  async function handlePost() {
    if ((!content.trim() && !mediaUri) || !user) return;
    if (content.trim() && containsBlockedContent(content.trim())) {
      Alert.alert("Not allowed", CONTENT_FILTER_MESSAGE);
      return;
    }

    setIsPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const postContent = content.trim() || (mediaType === "video" ? "🎬" : "📸");
      const result = await createFeedPost({
        content: postContent,
        mediaUrl: mediaUri || undefined,
      });

      if (result.duplicate || !result.post) {
        const msg = result.message || "You've already posted similar content in the last 24 hours.";
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
  const canPost = (content.trim().length > 0 || !!mediaUri) && !isPosting;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>New Post</Text>
        <Pressable
          style={({ pressed }) => [
            styles.postButton,
            pressed && { opacity: 0.8 },
            !canPost && styles.postButtonDisabled,
          ]}
          onPress={handlePost}
          disabled={!canPost}
        >
          <Text style={styles.postButtonText}>
            {isPosting ? "Posting..." : "Post"}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.input}
          placeholder="What's happening in your business?"
          placeholderTextColor={Colors.textMuted}
          value={content}
          onChangeText={(text) => setContent(text.substring(0, maxChars))}
          multiline
          autoFocus
          textAlignVertical="top"
          maxLength={maxChars}
        />

        {mediaUri && (
          <View style={styles.mediaPreview}>
            {mediaType === "video" ? (
              <View style={styles.videoPlaceholder}>
                <Ionicons name="videocam" size={40} color={Colors.primary} />
                <Text style={styles.videoText}>Video attached</Text>
              </View>
            ) : (
              <Image source={{ uri: mediaUri }} style={styles.mediaImage} resizeMode="cover" />
            )}
            <Pressable onPress={removeMedia} style={styles.removeMedia}>
              <Ionicons name="close-circle" size={28} color="#fff" />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.mediaBar}>
          <Pressable
            onPress={handleAddMedia}
            style={({ pressed }) => [styles.mediaButton, pressed && { opacity: 0.7 }]}
            disabled={isPickingMedia}
          >
            {isPickingMedia ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="image-outline" size={24} color={Colors.primary} />
            )}
          </Pressable>
          <Pressable
            onPress={() => pickMedia(true, "images")}
            style={({ pressed }) => [styles.mediaButton, pressed && { opacity: 0.7 }]}
            disabled={isPickingMedia}
          >
            <Ionicons name="camera-outline" size={24} color={Colors.primary} />
          </Pressable>
        </View>
        <View style={styles.footerRight}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.infoText}>24h</Text>
          </View>
          <Text style={[styles.charCount, charCount > maxChars * 0.9 && { color: Colors.danger }]}>
            {charCount}/{maxChars}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  postButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postButtonDisabled: { opacity: 0.4 },
  postButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  input: {
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    minHeight: 80,
    maxHeight: 160,
    paddingTop: 16,
    paddingBottom: 8,
  },
  mediaPreview: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 16,
  },
  mediaImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: Colors.card,
  },
  videoPlaceholder: {
    width: "100%",
    height: 150,
    borderRadius: 12,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  videoText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  removeMedia: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  mediaBar: {
    flexDirection: "row",
    gap: 4,
  },
  mediaButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
