import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import Colors from "@/constants/colors";
import { useAgeGate } from "@/lib/age-gate-context";
import { parseAgeRangeError } from "@/lib/age-gate-api";
import { SOCIAL_MEDIA_MIN_AGE, ageFromDateOfBirth } from "@shared/age-gate";

const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Settings → Account → Date of birth editor.
 * Server rules (POST /api/user/age-range): real YYYY-MM-DD date, not in the future, age 0–120;
 * one change per 30 days unless the change turns social features off; typed dates can't replace
 * device age verification.
 */
export function ChangeDobModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { ageStatus, changeDateOfBirth, isChecking } = useAgeGate();
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDob(ageStatus?.dateOfBirth || "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill only when the editor opens
  }, [visible]);

  const trimmed = dob.trim();
  const unchanged = !!ageStatus?.dateOfBirth && trimmed === ageStatus.dateOfBirth;

  async function save() {
    setError(null);
    if (!DOB_PATTERN.test(trimmed)) {
      setError("Use the format YYYY-MM-DD, e.g. 1990-04-27.");
      return;
    }
    const age = ageFromDateOfBirth(trimmed);
    const blocks = age != null && age < SOCIAL_MEDIA_MIN_AGE;
    if (blocks && Platform.OS !== "web") {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Social features will turn off",
          `Users under ${SOCIAL_MEDIA_MIN_AGE} can't use the Newsfeed or Lekker Social. ` +
            "You can only change your date of birth again after 30 days.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Save", style: "destructive", onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const result = await changeDateOfBirth(trimmed);
      onClose();
      Alert.alert(
        "Date of birth updated",
        result.socialMediaAllowed
          ? "Social features (Newsfeed and Lekker Social) are on."
          : `Social features are off for users under ${SOCIAL_MEDIA_MIN_AGE}.`,
      );
    } catch (e) {
      const parsed = parseAgeRangeError(e);
      setError(parsed.message || "Could not save your date of birth. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const deviceVerified = !!ageStatus?.ageVerifiedByDevice;
  const nextAllowed = ageStatus?.nextAgeChangeAllowedAt
    ? ageStatus.nextAgeChangeAllowedAt.slice(0, 10)
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Date of birth</Text>
          {deviceVerified ? (
            <Text style={styles.body}>
              Your age was confirmed by your device&apos;s age verification, so it can&apos;t be
              changed here.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Used to confirm your age for social features. Users under {SOCIAL_MEDIA_MIN_AGE} can&apos;t
                use the Newsfeed or Lekker Social. You can change it once every 30 days.
              </Text>
              {nextAllowed ? (
                <Text style={styles.hint}>
                  Next change allowed from {nextAllowed} (a change that turns social features off is
                  allowed any time).
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textMuted}
                value={dob}
                onChangeText={(v) => {
                  setDob(v);
                  if (error) setError(null);
                }}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                maxLength={10}
                testID="change-dob-input"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.primaryBtn, (!trimmed || unchanged) && styles.disabled]}
                onPress={() => void save()}
                disabled={saving || isChecking || !trimmed || unchanged}
                testID="change-dob-save"
              >
                {saving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save</Text>
                )}
              </Pressable>
            </>
          )}
          <Pressable onPress={onClose} style={styles.secondaryBtn}>
            <Text style={styles.secondaryText}>{deviceVerified ? "Close" : "Cancel"}</Text>
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
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
  },
  error: { color: Colors.danger, fontSize: 13, fontFamily: "Poppins_400Regular" },
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
