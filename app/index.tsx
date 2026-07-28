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
import { COMMUNITY_GUIDELINES_URL, PRIVACY_POLICY_URL } from "@/constants/safety";

const lekkerLogo = require("../assets/images/lekker-logo.png");

type Step = "phone" | "code";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { isLoggedIn, isLoading, verifyWhatsApp } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const canSubmit = acceptedTerms && !isSubmitting;

  function requireTermsAccepted(): boolean {
    if (acceptedTerms) return true;
    setError("You must accept the Terms, Privacy Policy, and Community Guidelines to continue.");
    return false;
  }

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
    if (!requireTermsAccepted()) return;
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
    if (!requireTermsAccepted()) return;
    if (!code || code.length !== 6) {
      setError("Enter the 6-digit WhatsApp code");
      return;
    }
    setIsSubmitting(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // WhatsApp OTP only — no password, no required name/profile at signup
      const result = await verifyWhatsApp({
        phone: phone.trim(),
        code: code.trim(),
      });
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
                Enter your mobile number. We&apos;ll send a one-time code on WhatsApp.
                No password. No name required to get started.
              </Text>
              <Text style={styles.label}>Mobile number</Text>
              <TextInput
                style={styles.input}
                placeholder="082 XXX XXXX or +27..."
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setError("");
                }}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoFocus
                testID="login-phone"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  !canSubmit && styles.buttonDisabled,
                ]}
                onPress={handleSendCode}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Send WhatsApp Code</Text>
                )}
              </Pressable>
            </>
          ) : (
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
                onChangeText={(t) => {
                  setCode(t.replace(/[^0-9]/g, "").slice(0, 6));
                  setError("");
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                testID="login-code"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  !canSubmit && styles.buttonDisabled,
                ]}
                onPress={handleVerify}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>{isExistingUser ? "Sign In" : "Continue"}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep("phone");
                  setCode("");
                }}
                style={styles.link}
              >
                <Text style={styles.linkText}>← Change number</Text>
              </Pressable>
              <Pressable onPress={handleSendCode} style={styles.link} disabled={isSubmitting}>
                <Text style={styles.linkText}>Resend code</Text>
              </Pressable>
            </>
          )}

          <Pressable
            style={styles.termsRow}
            onPress={() => {
              setAcceptedTerms((v) => !v);
              if (error.includes("accept the Terms")) setError("");
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            testID="accept-terms-checkbox"
          >
            <View style={[styles.termsCheckbox, acceptedTerms && styles.termsCheckboxChecked]}>
              {acceptedTerms ? <Feather name="check" size={14} color={Colors.background} /> : null}
            </View>
            <Text style={styles.termsText}>
              I agree to the{" "}
              <Text
                style={styles.legalAgreementLink}
                onPress={() => Linking.openURL("https://lekker.network/terms")}
              >
                Terms & Conditions
              </Text>
              ,{" "}
              <Text
                style={styles.legalAgreementLink}
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              >
                Privacy Policy
              </Text>
              , and{" "}
              <Text
                style={styles.legalAgreementLink}
                onPress={() => Linking.openURL(COMMUNITY_GUIDELINES_URL)}
              >
                Community Guidelines
              </Text>
              . There is no tolerance for objectionable content or abusive users.
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Powered by Lekker Network</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: isSmallScreen ? 20 : 32,
    flexGrow: 1,
  },
  logoContainer: { alignItems: "center", marginBottom: isSmallScreen ? 24 : 36 },
  logo: {
    width: isSmallScreen ? 140 : 180,
    height: isSmallScreen ? 56 : 72,
    marginBottom: 10,
  },
  appName: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(26),
    color: Colors.text,
  },
  tagline: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: Colors.primary,
  },
  formContainer: { width: "100%", maxWidth: 400 },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(20),
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: Colors.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: fontScale(12),
    color: Colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(16),
    color: Colors.text,
    marginBottom: 16,
  },
  codeInput: {
    letterSpacing: 8,
    textAlign: "center",
    fontSize: fontScale(22),
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(16),
    color: Colors.background,
  },
  link: { alignItems: "center", paddingVertical: 8 },
  linkText: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: Colors.primary,
  },
  errorBanner: {
    backgroundColor: "rgba(255,80,80,0.15)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: "#FF6B6B",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
  },
  termsCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  termsCheckboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  termsText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
    color: Colors.textMuted,
    lineHeight: 18,
  },
  legalAgreementLink: {
    color: Colors.primary,
    textDecorationLine: "underline",
  },
  footer: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(11),
    color: Colors.textMuted,
    marginTop: 32,
  },
});
