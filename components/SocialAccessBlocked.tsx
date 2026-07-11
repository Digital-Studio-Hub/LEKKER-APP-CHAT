import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SOCIAL_MEDIA_MIN_AGE } from "@shared/age-gate";

export function SocialAccessBlocked({ feature = "this feature" }: { feature?: string }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="shield-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.title}>Social access unavailable</Text>
      <Text style={styles.body}>
        {feature} is not available for users under {SOCIAL_MEDIA_MIN_AGE}.
        Messaging and business tools remain available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  body: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});