import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { MAX_CHAT_PROFILES } from "@shared/chat-profile";

type Step = "phone" | "code";

/** Add another WhatsApp number without replacing the profiles already on this phone. */
export default function AddProfileScreen() {
  const insets = useSafeAreaInsets();
  const { addProfileViaWhatsApp, profiles } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    const trimmed = phone.trim();
    if (trimmed.length < 8) {
      setError("Enter the full mobile number, including country code");
      return;
    }
    if (profiles.some((p) => p.phone.replace(/\s/g, "") === trimmed.replace(/\s/g, ""))) {
      setError("That number is already a profile on this phone");
      return;
    }
    if (profiles.length >= MAX_CHAT_PROFILES) {
      setError(`This phone can keep ${MAX_CHAT_PROFILES} numbers. Remove one in Settings to add another.`);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(new URL("/api/auth/whatsapp/send-code", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || "Could not send a code");
        return;
      }
      setStep("code");
    } catch {
      setError("Could not send a code. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verify() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit WhatsApp code");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const result = await addProfileViaWhatsApp({ phone: phone.trim(), code: code.trim() });
      if (!result.success) {
        setError(result.message || "Verification failed");
        return;
      }
      router.replace("/(tabs)");
    } catch {
      setError("Verification failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) }]}>
      <Pressable onPress={() => router.back()} style={styles.back} testID="add-profile-back">
        <Ionicons name="chevron-back" size={24} color={Colors.text} />
        <Text style={styles.backText}>Settings</Text>
      </Pressable>
      <Text style={styles.title}>Add a profile</Text>
      <Text style={styles.subtitle}>
        Verify another WhatsApp number. It is saved next to the profiles already on this phone. Chats, push alerts, and Cledwyn stay on the number you open.
      </Text>

      {step === "phone" ? (
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+27..."
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          testID="add-profile-phone"
        />
      ) : (
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="6-digit code"
          placeholderTextColor={Colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          testID="add-profile-code"
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, isSubmitting && { opacity: 0.7 }]}
        disabled={isSubmitting}
        onPress={() => void (step === "phone" ? sendCode() : verify())}
        testID="add-profile-submit"
      >
        {isSubmitting ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.buttonText}>{step === "phone" ? "Send WhatsApp code" : "Verify and switch"}</Text>
        )}
      </Pressable>
      {step === "code" ? (
        <Pressable onPress={() => { setStep("phone"); setCode(""); setError(""); }} style={styles.secondary}>
          <Text style={styles.secondaryText}>Use a different number</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 16, minHeight: 44 },
  backText: { color: Colors.text, fontFamily: "Poppins_500Medium", fontSize: fontScale(15) },
  title: { color: Colors.text, fontFamily: "Poppins_700Bold", fontSize: fontScale(24), marginBottom: 8 },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(14),
    lineHeight: 22,
    marginBottom: 20,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(16),
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
  },
  error: { color: Colors.danger, fontFamily: "Poppins_400Regular", marginTop: 10 },
  button: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: Colors.background, fontFamily: "Poppins_600SemiBold", fontSize: fontScale(15) },
  secondary: { marginTop: 16, minHeight: 44, justifyContent: "center" },
  secondaryText: { color: Colors.primary, fontFamily: "Poppins_500Medium" },
});
