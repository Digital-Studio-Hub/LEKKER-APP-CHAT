import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import Colors from "@/constants/colors";
import { useAgeGate } from "@/lib/age-gate-context";
import { SOCIAL_MEDIA_MIN_AGE } from "@shared/age-gate";

export function SocialAgeGateModal() {
  const {
    showDobPrompt,
    isChecking,
    declareWithDevice,
    declareWithDateOfBirth,
    dismissDobPrompt,
  } = useAgeGate();
  const [dob, setDob] = useState("");

  if (!showDobPrompt) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm your age</Text>
          <Text style={styles.body}>
            Social features (Newsfeed and Lekker Social) require age verification.
            Users under {SOCIAL_MEDIA_MIN_AGE} cannot access social media in this app.
          </Text>

          {Platform.OS !== "web" && (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => void declareWithDevice()}
              disabled={isChecking}
            >
              {isChecking ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify with device</Text>
              )}
            </Pressable>
          )}

          <Text style={styles.or}>or enter date of birth</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            value={dob}
            onChangeText={setDob}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.primaryBtn, !dob && styles.disabled]}
            onPress={() => dob && void declareWithDateOfBirth(dob)}
            disabled={isChecking || !dob}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
          <Pressable onPress={dismissDobPrompt} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  body: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  or: {
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#000",
  },
  disabled: { opacity: 0.5 },
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryText: { color: Colors.textMuted, fontSize: 13 },
});