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
import { storage } from "@/lib/storage";

export default function NewChatScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function handleCreate() {
    if (!name.trim() || !phone.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const conversation = await storage.addConversation(
      name.trim(),
      phone.trim(),
    );
    router.back();
    setTimeout(() => {
      router.push({ pathname: "/chat/[id]", params: { id: conversation.id } });
    }, 300);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Chat</Text>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Contact Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter name"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+27 XX XXX XXXX"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
            (!name.trim() || !phone.trim()) && styles.buttonDisabled,
          ]}
          onPress={handleCreate}
          disabled={!name.trim() || !phone.trim()}
        >
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={styles.buttonText}>Start Chat</Text>
        </Pressable>
      </View>

      <View style={styles.inviteSection}>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.inviteButton, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (Platform.OS === "web") {
              alert("Invite link copied!");
            } else {
              Alert.alert("Invite Sent", "An invite to Lekker Chat has been sent.");
            }
          }}
        >
          <Ionicons name="paper-plane-outline" size={20} color={Colors.primary} />
          <Text style={styles.inviteButtonText}>Send App Invite</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginBottom: 24,
    textAlign: "center",
  },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
  inviteSection: { marginTop: 32 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: Colors.border },
  dividerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    paddingHorizontal: 16,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inviteButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: Colors.primary,
  },
});
