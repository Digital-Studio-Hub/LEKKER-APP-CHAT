import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { storage, CledwynMessage } from "@/lib/storage";

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

function TypingIndicator() {
  return (
    <View style={typingStyles.container}>
      <View style={typingStyles.bubble}>
        <View style={typingStyles.dots}>
          <View style={[typingStyles.dot, { opacity: 0.4 }]} />
          <View style={[typingStyles.dot, { opacity: 0.6 }]} />
          <View style={[typingStyles.dot, { opacity: 0.8 }]} />
        </View>
      </View>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4, alignItems: "flex-start" },
  bubble: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 4,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
});

function MessageBubble({ message }: { message: CledwynMessage }) {
  const isUser = message.role === "user";

  return (
    <View style={[bubbleStyles.container, isUser ? bubbleStyles.userContainer : bubbleStyles.assistantContainer]}>
      {!isUser && (
        <View style={bubbleStyles.botAvatar}>
          <Ionicons name="sparkles" size={16} color={Colors.background} />
        </View>
      )}
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble]}>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 3, flexDirection: "row", gap: 8 },
  userContainer: { justifyContent: "flex-end" },
  assistantContainer: { justifyContent: "flex-start", alignItems: "flex-end" },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  bubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  userBubble: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: Colors.card, borderBottomLeftRadius: 4 },
  text: { fontFamily: "Poppins_400Regular", fontSize: 15, lineHeight: 22 },
  userText: { color: Colors.background },
  assistantText: { color: Colors.text },
});

export default function CledwynScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<CledwynMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      storage.getCledwynMessages().then((msgs) => {
        setMessages(msgs);
        initializedRef.current = true;
      });
    }
  }, []);

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInputText("");

    const currentMessages = [...messages];
    const userMessage: CledwynMessage = {
      id: generateUniqueId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      const baseUrl = getApiUrl();
      const chatHistory = [
        ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      const response = await fetch(`${baseUrl}api/cledwyn/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ messages: chatHistory }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;

              if (!assistantAdded) {
                setShowTyping(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateUniqueId(),
                    role: "assistant",
                    content: fullContent,
                    timestamp: new Date().toISOString(),
                  },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
            }
            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      setMessages((prev) => {
        storage.saveCledwynMessages(prev);
        return prev;
      });
    } catch (error) {
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: generateUniqueId(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }

  async function handleClearChat() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([]);
    await storage.saveCledwynMessages([]);
  }

  const reversedMessages = [...messages].reverse();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 84 : 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.headerLeft}>
          <View style={styles.cledwynAvatar}>
            <Ionicons name="sparkles" size={20} color={Colors.background} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Your Assistant</Text>
            <Text style={styles.headerSubtitle}>Your business assistant</Text>
          </View>
        </View>
        <Pressable onPress={handleClearChat} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>

      <FlatList
        data={reversedMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        inverted={messages.length > 0}
        ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Your Assistant</Text>
            <Text style={styles.emptySubtitle}>
              Ask me about business strategy, quotes, marketing, or anything else
            </Text>
          </View>
        }
      />

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) + webBottomInset }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Ask your assistant..."
          placeholderTextColor={Colors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={() => {
            handleSend();
            inputRef.current?.focus();
          }}
          style={[styles.sendButton, (!inputText.trim() || isStreaming) && styles.sendButtonDisabled]}
          disabled={!inputText.trim() || isStreaming}
        >
          {isStreaming ? (
            <ActivityIndicator size="small" color={Colors.background} />
          ) : (
            <Ionicons name="arrow-up" size={20} color={Colors.background} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cledwynAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesList: {
    paddingVertical: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    transform: [{ scaleY: -1 }],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
