import React, { useState, useRef } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { isSmallScreen, responsivePadding, fontScale } from "@/lib/responsive";

const lekkerLogo = require("../assets/images/lekker-logo.png");

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { isLoggedIn, isLoading, login } = useAuth();
  const [step, setStep] = useState<"phone" | "name">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    if (!isLoading && isLoggedIn) {
      router.replace("/(tabs)");
    }
  }, [isLoading, isLoggedIn]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isLoggedIn) return null;

  async function handleSubmit() {
    if (step === "phone") {
      if (phoneNumber.length < 6) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep("name");
      setTimeout(() => nameInputRef.current?.focus(), 300);
      return;
    }

    if (displayName.trim().length < 2) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await login(phoneNumber, displayName.trim());
      router.replace("/(tabs)");
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + webTopInset + 60 },
      ]}
    >
      <View style={styles.logoContainer}>
        <Image
          source={lekkerLogo}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.appName}>Lekker Chat</Text>
        <Text style={styles.tagline}>Connect. Chat. Grow.</Text>
      </View>

      <View style={styles.formContainer}>
        {step === "phone" ? (
          <>
            <Text style={styles.label}>Enter your phone number</Text>
            <TextInput
              style={styles.input}
              placeholder="+27 XX XXX XXXX"
              placeholderTextColor={Colors.textMuted}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoFocus
              accessibilityLabel="Phone number"
              accessibilityHint="Enter your South African phone number"
              testID="phone-input"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>What should we call you?</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="Display name"
              accessibilityHint="Enter what you want to be called"
              testID="name-input"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (step === "phone" ? phoneNumber.length < 6 : displayName.trim().length < 2) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={
            isSubmitting ||
            (step === "phone"
              ? phoneNumber.length < 6
              : displayName.trim().length < 2)
          }
          accessibilityRole="button"
          accessibilityLabel={step === "phone" ? "Continue" : "Get Started"}
          testID="submit-button"
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.buttonText}>
              {step === "phone" ? "Continue" : "Get Started"}
            </Text>
          )}
        </Pressable>

        {step === "name" && (
          <Pressable onPress={() => setStep("phone")} style={styles.backLink}>
            <Text style={styles.backLinkText}>Change number</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.footer}>
        Powered by Lekker Network
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: isSmallScreen ? 20 : 32,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: isSmallScreen ? 32 : 48,
  },
  logo: {
    width: isSmallScreen ? 160 : 200,
    height: isSmallScreen ? 64 : 80,
    marginBottom: 12,
  },
  appName: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(28),
    color: Colors.text,
    marginBottom: 4,
  },
  tagline: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(14),
    color: Colors.primary,
  },
  formContainer: {
    width: "100%" as const,
    maxWidth: 400,
  },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: fontScale(16),
    color: Colors.text,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: isSmallScreen ? 16 : 20,
    paddingVertical: isSmallScreen ? 14 : 16,
    fontSize: fontScale(18),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: isSmallScreen ? 14 : 16,
    alignItems: "center" as const,
    minHeight: 48,
    justifyContent: "center" as const,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(16),
    color: Colors.background,
  },
  backLink: {
    alignItems: "center" as const,
    marginTop: 16,
    padding: 8,
    minHeight: 44,
    justifyContent: "center" as const,
  },
  backLinkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(14),
    color: Colors.primary,
  },
  footer: {
    position: "absolute" as const,
    bottom: 40,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
    color: Colors.textMuted,
  },
});
