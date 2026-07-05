import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { isSmallScreen, fontScale } from "@/lib/responsive";
import { getApiUrl } from "@/lib/query-client";
import { PRIVACY_POLICY_URL } from "@/constants/safety";

const lekkerLogo = require("../assets/images/lekker-logo.png");

type Step = "phone" | "code" | "name";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { isLoggedIn, isLoading, verifyWhatsApp } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);

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

  async function handleSendCode() {
    const trimmed = phone.trim();
    if (trimmed.length < 8) {
      setError("Enter a valid South African mobile number");
      return;
    }
    setIsSubmitting(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(new URL("/api/auth/whatsapp/send-code", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not send code");
        return;
      }
      setIsExistingUser(!!data.isExistingUser);
      setCode("");
      setStep("code");
    } catch {
      setError("Connection failed. Check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!code || code.length !== 6) {
      setError("Enter the 6-digit WhatsApp code");
      return;
    }
    setIsSubmitting(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await verifyWhatsApp({
        phone: phone.trim(),
        code: code.trim(),
        displayName: displayName.trim() || undefined,
      });
      if (result.needsDisplayName) {
        setStep("name");
        return;
      }
      if (!result.success) {
        setError(result.message || "Verification failed");
        return;
      }
      router.replace("/(tabs)");
    } catch {
      setError("Connection failed. Check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateAccount() {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError("Enter your display name (at least 2 characters)");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const result = await verifyWhatsApp({
        phone: phone.trim(),
        code: code.trim(),
        displayName: displayName.trim(),
      });
      if (!result.success) {
        setError(result.message || "Could not create account");
        return;
      }
      router.replace("/(tabs)");
    } catch {
      setError("Connection failed. Check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + webTopInset + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image source={lekkerLogo} style={styles.logo} contentFit="contain" />
          <Text style={styles.appName}>Lekker Chat</Text>
          <Text style={styles.tagline}>Connect. Chat. Grow.</Text>
        </View>

        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          {step === "phone" ? (
            <>
              <Text style={styles.title}>Sign in with WhatsApp</Text>
              <Text style={styles.subtitle}>
                We&apos;ll send a one-time code to confirm your number. No password needed.
              </Text>
              <Text style={styles.label}>Mobile number</Text>
              <TextInput
                style={styles.input}
                placeholder="082 XXX XXXX or +27..."
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(""); }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoFocus
                testID="login-phone"
              />
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Send WhatsApp Code</Text>
                )}
              </Pressable>
            </>
          ) : step === "code" ? (
            <>
              <Text style={styles.title}>Enter your code</Text>
              <Text style={styles.subtitle}>
                Check WhatsApp for the 6-digit code we sent to {phone}
              </Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={Colors.textMuted}
                value={code}
                onChangeText={(t) => { setCode(t.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                testID="login-code"
              />
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
                onPress={handleVerify}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>{isExistingUser ? "Sign In" : "Continue"}</Text>
                )}
              </Pressable>
              <Pressable onPress={() => { setStep("phone"); setCode(""); }} style={styles.link}>
                <Text style={styles.linkText}>← Change number</Text>
              </Pressable>
              <Pressable onPress={handleSendCode} style={styles.link} disabled={isSubmitting}>
                <Text style={styles.linkText}>Resend code</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Welcome!</Text>
              <Text style={styles.subtitle}>How should we display your name in chats?</Text>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={Colors.textMuted}
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setError(""); }}
                autoCapitalize="words"
                autoFocus
                testID="login-display-name"
              />
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
                onPress={handleCreateAccount}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Get Started</Text>
                )}
              </Pressable>
            </>
          )}

          <Text style={styles.legal}>
            By continuing you agree to our{" "}
            <Text style={styles.legalLink} onPress={() => Linking.openURL("https://lekker.network/terms")}>
              Terms
            </Text>
            {" "}and{" "}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>

        <Text style={styles.footer}>Powered by Lekker Network</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  scrollContent: { alignItems: "center", paddingHorizontal: isSmallScreen ? 20 : 32, flexGrow: 1 },
  logoContainer: { alignItems: "center", marginBottom: isSmallScreen ? 24 : 36 },
  logo: { width: isSmallScreen ? 140 : 180, height: isSmallScreen ? 56 : 72, marginBottom: 10 },
  appName: { fontFamily: "Poppins_700Bold", fontSize: fontScale(26), color: Colors.text },
  tagline: { fontFamily: "Poppins_400Regular", fontSize: fontScale(13), color: Colors.primary },
  formContainer: { width: "100%", maxWidth: 400 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(20), color: Colors.text, textAlign: "center", marginBottom: 8 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: fontScale(13), color: Colors.textSecondary, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  label: { fontFamily: "Poppins_500Medium", fontSize: fontScale(13), color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontScale(15),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
  },
  codeInput: { fontSize: fontScale(24), textAlign: "center", letterSpacing: 8, fontFamily: "Poppins_600SemiBold" },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: "Poppins_600SemiBold", fontSize: fontScale(16), color: Colors.background },
  link: { alignSelf: "center", marginTop: 14, paddingVertical: 8 },
  linkText: { fontFamily: "Poppins_500Medium", fontSize: fontScale(14), color: Colors.primary },
  errorBanner: {
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.3)",
  },
  errorBannerText: { fontFamily: "Poppins_400Regular", fontSize: fontScale(13), color: Colors.danger, textAlign: "center" },
  legal: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(11),
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 18,
  },
  legalLink: { color: Colors.primary, fontFamily: "Poppins_500Medium" },
  footer: { marginTop: 24, fontFamily: "Poppins_400Regular", fontSize: fontScale(12), color: Colors.textMuted },
});