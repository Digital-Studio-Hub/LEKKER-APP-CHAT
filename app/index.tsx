import React, { useState, useRef } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { isSmallScreen, fontScale } from "@/lib/responsive";

const lekkerLogo = require("../assets/images/lekker-logo.png");

type Mode = "login" | "register";

interface FormErrors {
  [key: string]: string;
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special char", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const metCount = checks.filter((c) => c.met).length;
  const barColor =
    metCount <= 1 ? Colors.danger : metCount <= 2 ? Colors.away : metCount <= 3 ? Colors.primary : Colors.success;

  if (password.length === 0) return null;

  return (
    <View style={strengthStyles.container}>
      <View style={strengthStyles.barTrack}>
        <View style={[strengthStyles.barFill, { width: `${(metCount / 4) * 100}%`, backgroundColor: barColor }]} />
      </View>
      <View style={strengthStyles.checks}>
        {checks.map((c) => (
          <Text key={c.label} style={[strengthStyles.checkText, c.met && strengthStyles.checkMet]}>
            {c.met ? "✓" : "○"} {c.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const strengthStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  barTrack: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 8 },
  barFill: { height: 4, borderRadius: 2 },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checkText: { fontSize: fontScale(11), color: Colors.textMuted, fontFamily: "Poppins_400Regular" },
  checkMet: { color: Colors.success },
});

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { isLoggedIn, isLoading, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const emailRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const loginPassRef = useRef<TextInput>(null);

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

  function clearErrors() {
    setErrors({});
    setGeneralError("");
  }

  function validateLogin(): boolean {
    const e: FormErrors = {};
    if (!identifier.trim()) e.identifier = "Email or phone number is required";
    if (!loginPassword) e.loginPassword = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateRegister(): boolean {
    const e: FormErrors = {};
    if (!phone || phone.length < 6) e.phone = "Valid phone number is required";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Valid email is required";
    if (!username || username.length < 3) e.username = "Username must be at least 3 characters";
    else if (!/^[a-zA-Z0-9_]+$/.test(username)) e.username = "Letters, numbers, and underscores only";
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (password.length < 8) e.password = "At least 8 characters";
    else if (!/[A-Z]/.test(password)) e.password = "Needs an uppercase letter";
    else if (!/[0-9]/.test(password)) e.password = "Needs a number";
    else if (!/[^A-Za-z0-9]/.test(password)) e.password = "Needs a special character";
    if (password !== confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validateLogin()) return;
    setIsSubmitting(true);
    setGeneralError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await login({ identifier: identifier.trim(), password: loginPassword });
      if (result.success) {
        router.replace("/(tabs)");
      } else {
        setGeneralError(result.message || "Invalid credentials");
      }
    } catch (e: any) {
      setGeneralError("Connection failed. Check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister() {
    if (!validateRegister()) return;
    setIsSubmitting(true);
    setGeneralError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await register({
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      if (result.success) {
        router.replace("/(tabs)");
      } else if (result.errors) {
        const fieldErrors: FormErrors = {};
        result.errors.forEach((err: any) => {
          if (err.field && err.field !== "general") {
            fieldErrors[err.field] = err.message;
          } else {
            setGeneralError(err.message);
          }
        });
        setErrors(fieldErrors);
      }
    } catch (e: any) {
      setGeneralError("Connection failed. Check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(newMode: Mode) {
    clearErrors();
    setMode(newMode);
    setGeneralError("");
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + webTopInset + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image source={lekkerLogo} style={styles.logo} contentFit="contain" />
          <Text style={styles.appName}>Lekker Chat</Text>
          <Text style={styles.tagline}>Connect. Chat. Grow.</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeTab, mode === "login" && styles.modeTabActive]}
              onPress={() => switchMode("login")}
              testID="login-tab"
            >
              <Text style={[styles.modeTabText, mode === "login" && styles.modeTabTextActive]}>Sign In</Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === "register" && styles.modeTabActive]}
              onPress={() => switchMode("register")}
              testID="register-tab"
            >
              <Text style={[styles.modeTabText, mode === "register" && styles.modeTabTextActive]}>Register</Text>
            </Pressable>
          </View>

          {generalError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{generalError}</Text>
            </View>
          ) : null}

          {mode === "login" ? (
            <>
              <Text style={styles.label}>Email or phone number</Text>
              <TextInput
                style={[styles.input, errors.identifier ? styles.inputError : null]}
                placeholder="email@example.com or +27..."
                placeholderTextColor={Colors.textMuted}
                value={identifier}
                onChangeText={(t) => { setIdentifier(t); if (errors.identifier) setErrors((e) => ({ ...e, identifier: "" })); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => loginPassRef.current?.focus()}
                accessibilityLabel="Email or phone number"
                testID="login-identifier"
              />
              {errors.identifier ? <Text style={styles.fieldError}>{errors.identifier}</Text> : null}

              <Text style={styles.label}>Password</Text>
              <TextInput
                ref={loginPassRef}
                style={[styles.input, errors.loginPassword ? styles.inputError : null]}
                placeholder="Enter your password"
                placeholderTextColor={Colors.textMuted}
                value={loginPassword}
                onChangeText={(t) => { setLoginPassword(t); if (errors.loginPassword) setErrors((e) => ({ ...e, loginPassword: "" })); }}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                accessibilityLabel="Password"
                testID="login-password"
              />
              {errors.loginPassword ? <Text style={styles.fieldError}>{errors.loginPassword}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isSubmitting}
                testID="login-button"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={[styles.input, errors.phone ? styles.inputError : null]}
                placeholder="+27 XX XXX XXXX"
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={(t) => { setPhone(t); if (errors.phone) setErrors((e) => ({ ...e, phone: "" })); }}
                keyboardType="phone-pad"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                accessibilityLabel="Phone number"
                testID="register-phone"
              />
              {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                ref={emailRef}
                style={[styles.input, errors.email ? styles.inputError : null]}
                placeholder="your@email.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); if (errors.email) setErrors((e) => ({ ...e, email: "" })); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => usernameRef.current?.focus()}
                accessibilityLabel="Email address"
                testID="register-email"
              />
              {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}

              <Text style={styles.label}>Username</Text>
              <TextInput
                ref={usernameRef}
                style={[styles.input, errors.username ? styles.inputError : null]}
                placeholder="lekkerpreneur_123"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={(t) => { setUsername(t); if (errors.username) setErrors((e) => ({ ...e, username: "" })); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => firstNameRef.current?.focus()}
                accessibilityLabel="Username"
                testID="register-username"
              />
              {errors.username ? <Text style={styles.fieldError}>{errors.username}</Text> : null}

              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    ref={firstNameRef}
                    style={[styles.input, errors.firstName ? styles.inputError : null]}
                    placeholder="First"
                    placeholderTextColor={Colors.textMuted}
                    value={firstName}
                    onChangeText={(t) => { setFirstName(t); if (errors.firstName) setErrors((e) => ({ ...e, firstName: "" })); }}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    accessibilityLabel="First name"
                    testID="register-first-name"
                  />
                  {errors.firstName ? <Text style={styles.fieldError}>{errors.firstName}</Text> : null}
                </View>
                <View style={styles.nameField}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    ref={lastNameRef}
                    style={[styles.input, errors.lastName ? styles.inputError : null]}
                    placeholder="Last"
                    placeholderTextColor={Colors.textMuted}
                    value={lastName}
                    onChangeText={(t) => { setLastName(t); if (errors.lastName) setErrors((e) => ({ ...e, lastName: "" })); }}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    accessibilityLabel="Last name"
                    testID="register-last-name"
                  />
                  {errors.lastName ? <Text style={styles.fieldError}>{errors.lastName}</Text> : null}
                </View>
              </View>

              <Text style={styles.label}>Password</Text>
              <TextInput
                ref={passwordRef}
                style={[styles.input, errors.password ? styles.inputError : null]}
                placeholder="Min 8 chars, upper, number, special"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={(t) => { setPassword(t); if (errors.password) setErrors((e) => ({ ...e, password: "" })); }}
                secureTextEntry
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                accessibilityLabel="Password"
                testID="register-password"
              />
              {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
              <PasswordStrength password={password} />

              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                ref={confirmRef}
                style={[styles.input, errors.confirmPassword ? styles.inputError : null]}
                placeholder="Re-enter password"
                placeholderTextColor={Colors.textMuted}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: "" })); }}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={handleRegister}
                accessibilityLabel="Confirm password"
                testID="register-confirm-password"
              />
              {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSubmitting && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={isSubmitting}
                testID="register-button"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </Pressable>
            </>
          )}
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
  logoContainer: {
    alignItems: "center",
    marginBottom: isSmallScreen ? 24 : 36,
  },
  logo: {
    width: isSmallScreen ? 140 : 180,
    height: isSmallScreen ? 56 : 72,
    marginBottom: 10,
  },
  appName: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(26),
    color: Colors.text,
    marginBottom: 2,
  },
  tagline: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: Colors.primary,
  },
  formContainer: {
    width: "100%" as const,
    maxWidth: 400,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: fontScale(14),
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.background,
    fontFamily: "Poppins_600SemiBold",
  },
  errorBanner: {
    backgroundColor: "rgba(255,59,48,0.15)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.3)",
  },
  errorBannerText: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(13),
    color: Colors.danger,
    textAlign: "center",
  },
  label: {
    fontFamily: "Poppins_500Medium",
    fontSize: fontScale(13),
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: isSmallScreen ? 12 : 14,
    fontSize: fontScale(15),
    color: Colors.text,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 48,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  fieldError: {
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
    color: Colors.danger,
    marginTop: -8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  nameRow: {
    flexDirection: "row",
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: isSmallScreen ? 14 : 16,
    alignItems: "center" as const,
    minHeight: 48,
    justifyContent: "center" as const,
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(16),
    color: Colors.background,
  },
  footer: {
    marginTop: 24,
    fontFamily: "Poppins_400Regular",
    fontSize: fontScale(12),
    color: Colors.textMuted,
  },
});
