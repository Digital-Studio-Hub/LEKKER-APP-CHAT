import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Image,
  Modal,
  Linking,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { storage, Conversation, ChatMessage, MessageStatus, PollOption } from "@/lib/storage";
import { fetchDirectoryCached } from "@/lib/query-client";
import { isSmallScreen, fontScale, responsivePadding } from "@/lib/responsive";
import {
  pickImage,
  takePhoto,
  pickDocument,
  shareLocation,
  shareContact,
  startVoiceRecording,
  stopVoiceRecording,
  formatDuration,
  formatFileSize,
} from "@/lib/chat-attachments";

function ReceiptIcon({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  if (status === "sent") {
    return <Ionicons name="checkmark" size={14} color="rgba(0,0,0,0.4)" />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color="rgba(0,0,0,0.4)" />;
  }
  return <Ionicons name="checkmark-done" size={14} color="#4CD964" />;
}

function VoiceNotePlayer({ uri, duration, isMe }: { uri: string; duration?: number; isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  async function togglePlayback() {
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }
    try {
      if (soundRef.current) {
        await soundRef.current.playAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              if (status.durationMillis && status.durationMillis > 0) {
                setProgress(status.positionMillis / status.durationMillis);
              }
              if (status.didJustFinish) {
                setIsPlaying(false);
                setProgress(0);
                soundRef.current = null;
              }
            }
          },
        );
        soundRef.current = sound;
      }
      setIsPlaying(true);
    } catch {}
  }

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const tColor = isMe ? Colors.background : Colors.text;
  const mColor = isMe ? "rgba(0,0,0,0.5)" : Colors.textMuted;

  return (
    <View style={vnStyles.container}>
      <Pressable onPress={togglePlayback} style={vnStyles.playBtn}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={tColor} />
      </Pressable>
      <View style={vnStyles.progressTrack}>
        <View style={[vnStyles.progressFill, { width: `${Math.max(progress * 100, 2)}%`, backgroundColor: tColor }]} />
      </View>
      <Text style={[vnStyles.duration, { color: mColor }]}>
        {formatDuration(duration || 0)}
      </Text>
    </View>
  );
}

const vnStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: isSmallScreen ? 120 : 160 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  progressTrack: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  duration: { fontSize: 11, fontFamily: "Poppins_400Regular" },
});

function PollBubble({ message, isMe, conversationId, onVote }: { message: ChatMessage; isMe: boolean; conversationId: string; onVote: () => void }) {
  const options = message.pollOptions || [];
  const totalVotes = options.reduce((sum, o) => sum + o.votes.length, 0);
  const myVote = options.find((o) => o.votes.includes("me"));

  async function handleVote(optionId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storage.votePoll(conversationId, message.id, optionId, "me");
    onVote();
  }

  const tColor = isMe ? Colors.background : Colors.text;
  const mColor = isMe ? "rgba(0,0,0,0.5)" : Colors.textMuted;
  const barBg = isMe ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.1)";
  const barFill = isMe ? "rgba(0,0,0,0.25)" : Colors.primary;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="stats-chart" size={14} color={tColor} />
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: tColor }}>
          {message.pollQuestion}
        </Text>
      </View>
      {options.map((opt) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
        const isMyVote = opt.votes.includes("me");
        return (
          <Pressable key={opt.id} onPress={() => handleVote(opt.id)} style={{ borderRadius: 8, overflow: "hidden" }}>
            <View style={{ backgroundColor: barBg, borderRadius: 8, padding: 8, position: "relative" }}>
              <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%` as any, backgroundColor: barFill, borderRadius: 8 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: tColor, zIndex: 1 }}>
                  {isMyVote ? "✓ " : ""}{opt.text}
                </Text>
                {totalVotes > 0 && (
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: mColor, zIndex: 1 }}>
                    {pct}%
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: mColor }}>
        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

function MessageBubbleInner({
  message,
  isMe,
  isGroup,
  senderName,
  conversationId,
  onReload,
}: {
  message: ChatMessage;
  isMe: boolean;
  isGroup?: boolean;
  senderName?: string;
  conversationId: string;
  onReload: () => void;
}) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const msgType = message.type || "text";
  const tColor = isMe ? Colors.background : Colors.text;
  const mColor = isMe ? "rgba(0,0,0,0.5)" : Colors.textMuted;

  function renderContent() {
    switch (msgType) {
      case "image":
        return (
          <View>
            {message.imageUri && (
              <Image
                source={{ uri: message.imageUri }}
                style={{ width: isSmallScreen ? 160 : 200, height: isSmallScreen ? 160 : 200, borderRadius: 12, marginBottom: 4 }}
                resizeMode="cover"
              />
            )}
            {message.content !== "📷 Photo" && message.content && (
              <Text style={[bubbleStyles.text, isMe ? bubbleStyles.meText : bubbleStyles.themText]}>
                {message.content}
              </Text>
            )}
          </View>
        );
      case "file":
        return (
          <Pressable
            onPress={() => {
              if (message.fileUri) {
                if (message.fileUri.startsWith("http")) {
                  router.push({ pathname: "/in-app-browser", params: { url: message.fileUri, title: message.fileName || "File" } });
                } else {
                  Linking.openURL(message.fileUri).catch(() => {});
                }
              }
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: isMe ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document" size={20} color={tColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: tColor }} numberOfLines={1}>
                {message.fileName || "File"}
              </Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: mColor }}>
                {formatFileSize(message.fileSize)}
              </Text>
            </View>
          </Pressable>
        );
      case "voicenote":
        return (
          <VoiceNotePlayer
            uri={message.audioUri || ""}
            duration={message.audioDuration}
            isMe={isMe}
          />
        );
      case "location":
        return (
          <Pressable
            onPress={() => {
              if (message.latitude && message.longitude) {
                if (Platform.OS === "web") {
                  const mapUrl = `https://www.google.com/maps?q=${message.latitude},${message.longitude}`;
                  router.push({ pathname: "/in-app-browser", params: { url: mapUrl, title: message.locationName || "Location" } });
                } else {
                  const url = Platform.select({
                    ios: `maps:0,0?q=${message.latitude},${message.longitude}`,
                    android: `geo:${message.latitude},${message.longitude}?q=${message.latitude},${message.longitude}`,
                    default: `https://www.google.com/maps?q=${message.latitude},${message.longitude}`,
                  });
                  Linking.openURL(url).catch(() => {});
                }
              }
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isMe ? "rgba(0,0,0,0.15)" : Colors.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="location" size={20} color={isMe ? Colors.background : Colors.background} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: tColor }}>
                  {message.locationName || "Location"}
                </Text>
                <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: mColor }}>
                  Tap to open in Maps
                </Text>
              </View>
            </View>
          </Pressable>
        );
      case "poll":
        return (
          <PollBubble
            message={message}
            isMe={isMe}
            conversationId={conversationId}
            onVote={onReload}
          />
        );
      case "contact":
        return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isMe ? "rgba(0,0,0,0.15)" : Colors.cardElevated, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={20} color={tColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: tColor }}>
                {message.sharedContactName || "Contact"}
              </Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: mColor }}>
                {message.sharedContactPhone || ""}
              </Text>
            </View>
          </View>
        );
      default:
        return (
          <Text style={[bubbleStyles.text, isMe ? bubbleStyles.meText : bubbleStyles.themText]}>
            {message.content}
          </Text>
        );
    }
  }

  return (
    <View style={[bubbleStyles.wrapper, isMe ? bubbleStyles.meWrapper : bubbleStyles.themWrapper]}>
      <View style={[bubbleStyles.bubble, isMe ? bubbleStyles.meBubble : bubbleStyles.themBubble]}>
        {isGroup && !isMe && senderName && (
          <Text style={bubbleStyles.senderName}>{senderName}</Text>
        )}
        {renderContent()}
        <View style={bubbleStyles.metaRow}>
          <Text style={[bubbleStyles.time, isMe ? bubbleStyles.meTime : bubbleStyles.themTime]}>
            {time}
          </Text>
          {isMe && <ReceiptIcon status={message.status} />}
        </View>
      </View>
    </View>
  );
}

const MessageBubble = React.memo(MessageBubbleInner);

const bubbleStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: isSmallScreen ? 10 : 16, paddingVertical: 2 },
  meWrapper: { alignItems: "flex-end" },
  themWrapper: { alignItems: "flex-start" },
  bubble: { maxWidth: isSmallScreen ? "85%" : "78%", borderRadius: 18, paddingHorizontal: isSmallScreen ? 10 : 14, paddingVertical: 8 },
  meBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  themBubble: { backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  senderName: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(12), color: Colors.primary, marginBottom: 2 },
  text: { fontFamily: "Poppins_400Regular", fontSize: fontScale(15), lineHeight: fontScale(22) },
  meText: { color: Colors.background },
  themText: { color: Colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 2 },
  time: { fontFamily: "Poppins_400Regular", fontSize: fontScale(10) },
  meTime: { color: "rgba(0,0,0,0.4)" },
  themTime: { color: Colors.textMuted },
});

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLekkerpreneur, setIsLekkerpreneur] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const inputRef = useRef<TextInput>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    loadConversation();
    loadLekkerStatus();
    checkBlocked();
    refreshIntervalRef.current = setInterval(() => {
      loadConversation();
    }, 4000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        storage.markConversationSeen(id);
        checkBlocked();
      }
    }, [id]),
  );

  async function loadConversation() {
    const convs = await storage.getConversations();
    const conv = convs.find((c) => c.id === id);
    if (conv) {
      conv.unreadCount = 0;
      await storage.saveConversations(convs);
      setConversation(conv);
    }
  }

  async function loadLekkerStatus() {
    try {
      const data = await fetchDirectoryCached();
      const convs = await storage.getConversations();
      const conv = convs.find((c) => c.id === id);
      if (conv) {
        const phones = new Set(data.entries.map((e: any) => e.phone));
        setIsLekkerpreneur(phones.has(conv.contactId));
      }
    } catch (e) {}
  }

  async function checkBlocked() {
    if (!id) return;
    const convs = await storage.getConversations();
    const conv = convs.find((c) => c.id === id);
    if (conv && !conv.isGroup) {
      const blocked = await storage.isUserBlocked(conv.contactId);
      setIsBlocked(blocked);
    }
  }

  async function handleToggleBlock() {
    if (!conversation || conversation.isGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isBlocked) {
      await storage.unblockUser(conversation.contactId);
      setIsBlocked(false);
    } else {
      Alert.alert(
        "Block " + conversation.contactName + "?",
        "Blocked users cannot send you messages. You can unblock them later from Settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: async () => {
              await storage.blockUser(conversation.contactName, conversation.contactId);
              setIsBlocked(true);
            },
          },
        ],
      );
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !id || isBlocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText("");
    await storage.addMessageToConversation(id, text, "me");
    await loadConversation();
  }

  async function handleSendAttachment(attachment: Partial<ChatMessage>) {
    if (!id || isBlocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const label = getAttachmentLabel(attachment);
    await storage.addMessageToConversation(id, label, "me", attachment);
    await loadConversation();
  }

  function getAttachmentLabel(attachment: Partial<ChatMessage>): string {
    switch (attachment.type) {
      case "image": return "📷 Photo";
      case "file": return `📎 ${attachment.fileName || "File"}`;
      case "voicenote": return `🎤 Voice note (${formatDuration(attachment.audioDuration || 0)})`;
      case "location": return `📍 ${attachment.locationName || "Location"}`;
      case "poll": return `📊 Poll: ${attachment.pollQuestion}`;
      case "contact": return `👤 ${attachment.sharedContactName || "Contact"}`;
      default: return "";
    }
  }

  async function handlePickImage() {
    setShowAttachMenu(false);
    const result = await pickImage();
    if (result) await handleSendAttachment(result);
  }

  async function handleTakePhoto() {
    setShowAttachMenu(false);
    const result = await takePhoto();
    if (result) await handleSendAttachment(result);
  }

  async function handlePickDocument() {
    setShowAttachMenu(false);
    const result = await pickDocument();
    if (result) await handleSendAttachment(result);
  }

  async function handleShareLocation() {
    setShowAttachMenu(false);
    const result = await shareLocation();
    if (result) await handleSendAttachment(result);
  }

  async function handleShareContact() {
    setShowAttachMenu(false);
    const result = await shareContact();
    if (result) await handleSendAttachment(result);
  }

  function handleOpenPoll() {
    setShowAttachMenu(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollModal(true);
  }

  async function handleCreatePoll() {
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!q) {
      Alert.alert("Error", "Please enter a question.");
      return;
    }
    if (opts.length < 2) {
      Alert.alert("Error", "Please add at least 2 options.");
      return;
    }
    setShowPollModal(false);
    await handleSendAttachment({
      type: "poll",
      pollQuestion: q,
      pollOptions: opts.map((text) => ({
        id: generateId(),
        text,
        votes: [],
      })),
    });
  }

  async function handleStartRecording() {
    setShowAttachMenu(false);
    const recording = await startVoiceRecording();
    if (!recording) return;
    recordingRef.current = recording;
    setIsRecording(true);
    setRecordingDuration(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);
  }

  async function handleStopRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (!recordingRef.current) {
      setIsRecording(false);
      return;
    }
    const result = await stopVoiceRecording(recordingRef.current);
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    if (result) await handleSendAttachment(result);
  }

  async function handleCancelRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
    }
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  }

  function getSenderName(senderId: string): string | undefined {
    if (!conversation?.isGroup || !conversation.groupMembers) return undefined;
    const member = conversation.groupMembers.find((m) => m.phone === senderId || m.id === senderId);
    return member?.name;
  }

  const messages = conversation?.messages || [];
  const reversedMessages = [...messages].reverse();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const attachmentOptions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }[] = [
    { icon: "image-outline", label: "Gallery", onPress: handlePickImage, color: "#4CD964" },
    { icon: "camera-outline", label: "Camera", onPress: handleTakePhoto, color: "#5AC8FA" },
    { icon: "document-outline", label: "File", onPress: handlePickDocument, color: "#FF9500" },
    { icon: "mic-outline", label: "Voice Note", onPress: handleStartRecording, color: "#FF3B30" },
    { icon: "location-outline", label: "Location", onPress: handleShareLocation, color: "#007AFF" },
    { icon: "stats-chart-outline", label: "Poll", onPress: handleOpenPoll, color: Colors.primary },
    { icon: "person-outline", label: "Contact", onPress: handleShareContact, color: "#AF52DE" },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        {conversation && (
          <Pressable
            style={styles.headerCenter}
            onPress={() => {
              if (!conversation.isGroup && conversation.contactId) {
                router.push({
                  pathname: "/user-profile/[id]",
                  params: {
                    id: conversation.contactId,
                    name: conversation.contactName || "Unknown",
                    avatarColor: conversation.contactAvatarColor || "#F7DC6F",
                  },
                });
              }
            }}
          >
            <View style={[styles.avatar, { backgroundColor: conversation.contactAvatarColor }]}>
              {conversation.isGroup ? (
                <Ionicons name="people" size={16} color="#fff" />
              ) : (
                <Text style={styles.avatarText}>
                  {conversation.contactName.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.headerName} numberOfLines={1}>{conversation.contactName}</Text>
                {isLekkerpreneur && !conversation.isGroup && (
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                )}
              </View>
              {conversation.isGroup && conversation.groupMembers && (
                <Text style={styles.headerMembers} numberOfLines={1}>
                  {conversation.groupMembers.map((m) => m.name.split(" ")[0]).join(", ")}
                </Text>
              )}
            </View>
          </Pressable>
        )}
        {conversation && !conversation.isGroup ? (
          <Pressable onPress={handleToggleBlock} style={styles.backButton}>
            <Ionicons
              name={isBlocked ? "ban" : "ban-outline"}
              size={22}
              color={isBlocked ? Colors.danger : Colors.textMuted}
            />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      <FlatList
        data={reversedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isMe={item.senderId === "me"}
            isGroup={conversation?.isGroup}
            senderName={getSenderName(item.senderId)}
            conversationId={id || ""}
            onReload={loadConversation}
          />
        )}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        initialNumToRender={20}
        contentContainerStyle={[styles.messageList, messages.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Send a message to start the conversation</Text>
          </View>
        }
      />

      {showAttachMenu && (
        <View style={styles.attachMenu}>
          <View style={styles.attachGrid}>
            {attachmentOptions.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={opt.onPress}
                style={({ pressed }) => [styles.attachOption, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.attachIconCircle, { backgroundColor: opt.color || Colors.primary }]}>
                  <Ionicons name={opt.icon} size={22} color="#fff" />
                </View>
                <Text style={styles.attachLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {isBlocked ? (
        <View style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Ionicons name="ban" size={16} color={Colors.danger} />
          <Text style={styles.blockedBarText}>You blocked this user</Text>
          <Pressable onPress={handleToggleBlock} style={styles.unblockButton}>
            <Text style={styles.unblockButtonText}>Unblock</Text>
          </Pressable>
        </View>
      ) : isRecording ? (
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.recordingLabel}>Recording...</Text>
          </View>
          <Pressable onPress={handleCancelRecording} style={styles.cancelRecButton}>
            <Ionicons name="close" size={20} color={Colors.danger} />
          </Pressable>
          <Pressable onPress={handleStopRecording} style={styles.sendButton}>
            <Ionicons name="send" size={18} color={Colors.background} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAttachMenu(!showAttachMenu);
            }}
            style={styles.attachButton}
          >
            <Ionicons
              name={showAttachMenu ? "close" : "add"}
              size={24}
              color={showAttachMenu ? Colors.primary : Colors.textMuted}
            />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textMuted}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              if (showAttachMenu) setShowAttachMenu(false);
            }}
            multiline
            maxLength={2000}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => {
              handleSend();
              inputRef.current?.focus();
            }}
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.background} />
          </Pressable>
        </View>
      )}

      <Modal visible={showPollModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.pollModal, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.pollHeader}>
              <Pressable onPress={() => setShowPollModal(false)}>
                <Text style={styles.pollCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.pollTitle}>Create Poll</Text>
              <Pressable onPress={handleCreatePoll}>
                <Text style={styles.pollDone}>Send</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.pollInput}
              placeholder="Ask a question..."
              placeholderTextColor={Colors.textMuted}
              value={pollQuestion}
              onChangeText={setPollQuestion}
            />
            {pollOptions.map((opt, i) => (
              <View key={i} style={styles.pollOptionRow}>
                <TextInput
                  style={[styles.pollInput, { flex: 1 }]}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={Colors.textMuted}
                  value={opt}
                  onChangeText={(text) => {
                    const updated = [...pollOptions];
                    updated[i] = text;
                    setPollOptions(updated);
                  }}
                />
                {pollOptions.length > 2 && (
                  <Pressable
                    onPress={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                    style={styles.pollRemoveBtn}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.danger} />
                  </Pressable>
                )}
              </View>
            ))}
            {pollOptions.length < 6 && (
              <Pressable
                onPress={() => setPollOptions([...pollOptions, ""])}
                style={styles.pollAddBtn}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.pollAddText}>Add Option</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backButton: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: isSmallScreen ? 6 : 10, flex: 1, justifyContent: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#fff" },
  headerName: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(17), color: Colors.text },
  headerMembers: { fontFamily: "Poppins_400Regular", fontSize: fontScale(11), color: Colors.textMuted, maxWidth: isSmallScreen ? 150 : 200 },
  messageList: { paddingVertical: 8 },
  emptyListContent: { flexGrow: 1, justifyContent: "center" },
  attachMenu: {
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  attachGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  attachOption: {
    alignItems: "center",
    width: 72,
    gap: 6,
  },
  attachIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  attachLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  attachButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: isSmallScreen ? 14 : 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontScale(15),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: { opacity: 0.4 },
  recordingBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: 16,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.danger,
  },
  recordingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.danger,
  },
  recordingLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  cancelRecButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  blockedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  blockedBarText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
  },
  unblockButton: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unblockButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  pollModal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pollHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pollTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.text,
  },
  pollCancel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
  },
  pollDone: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.primary,
  },
  pollInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pollOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pollRemoveBtn: {
    marginBottom: 10,
    padding: 4,
  },
  pollAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  pollAddText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.primary,
  },
});
