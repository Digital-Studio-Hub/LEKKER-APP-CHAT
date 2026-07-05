import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { ECOSYSTEM_SHORTCUTS, GOOGLE_SEARCH_URL } from "@/constants/ecosystem";

function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `${GOOGLE_SEARCH_URL}${encodeURIComponent(trimmed)}`;
}

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [urlInput, setUrlInput] = useState("");
  const bottomPad = Platform.OS === "web" ? 84 : 49 + insets.bottom + 16;

  function openUrl(url: string, title: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/in-app-browser", params: { url, title } });
  }

  function handleGo() {
    const url = normaliseUrl(urlInput);
    if (!url) return;
    openUrl(url, urlInput.trim());
    setUrlInput("");
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + webTopInset }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Browse</Text>
          <Text style={styles.headerSubtitle}>Explore the Lekker ecosystem</Text>
        </View>

        <View style={styles.omnibox}>
          <Ionicons name="globe-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.omniboxInput}
            placeholder="Search or enter a URL..."
            placeholderTextColor={Colors.textMuted}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleGo}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable onPress={handleGo} style={styles.goButton}>
            <Ionicons name="arrow-forward" size={18} color={Colors.background} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Shortcuts</Text>
        <View style={styles.shortcuts}>
          {ECOSYSTEM_SHORTCUTS.map((shortcut) => (
            <Pressable
              key={shortcut.id}
              style={({ pressed }) => [styles.shortcutCard, pressed && { opacity: 0.85 }]}
              onPress={() => openUrl(shortcut.url, shortcut.title)}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: `${shortcut.color}22` }]}>
                <Ionicons name={shortcut.icon} size={24} color={shortcut.color} />
              </View>
              <View style={styles.shortcutInfo}>
                <Text style={styles.shortcutTitle}>{shortcut.title}</Text>
                <Text style={styles.shortcutSubtitle}>{shortcut.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Quick search</Text>
        <Pressable
          style={({ pressed }) => [styles.searchCard, pressed && { opacity: 0.85 }]}
          onPress={() => openUrl(`${GOOGLE_SEARCH_URL}lekkerpreneur+South+Africa`, "Google")}
        >
          <Ionicons name="search" size={20} color={Colors.primary} />
          <Text style={styles.searchCardText}>Search the web with Google</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 16 },
  header: { paddingVertical: 12, paddingHorizontal: 4 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: fontScale(28), color: Colors.text },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  omnibox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    marginBottom: 24,
  },
  omniboxInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  goButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  shortcuts: { gap: 10, marginBottom: 24 },
  shortcutCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutInfo: { flex: 1 },
  shortcutTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  shortcutSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
  },
  searchCardText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
});