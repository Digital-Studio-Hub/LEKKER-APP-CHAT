import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  Switch,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { fontScale } from "@/lib/responsive";
import { searchUsers, fetchUserProfile, type SearchUser } from "@/lib/chat-api";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  CHECK_IN_INTERVAL_PRESETS,
  SILENCE_ALERT_PRESETS,
  DEFAULT_PERSONAL_CARE,
  hasPersonalPin,
  setPersonalPin,
  verifyPersonalPin,
  resetPersonalPinWithRecovery,
  isPersonalUnlocked,
  lockPersonalSettings,
  fetchPersonalCare,
  savePersonalCare,
  type PersonalCarePrefs,
} from "@/lib/personal-settings";

type GateMode = "loading" | "setup" | "unlock" | "recovery" | "open";

export default function PersonalSettingsScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;

  const [gate, setGate] = useState<GateMode>("loading");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryShown, setRecoveryShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<PersonalCarePrefs>({ ...DEFAULT_PERSONAL_CARE });
  const [familyLabel, setFamilyLabel] = useState<string | null>(null);
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyResults, setFamilyResults] = useState<SearchUser[]>([]);
  const [searchingFamily, setSearchingFamily] = useState(false);

  const bootstrap = useCallback(async () => {
    try {
      const hasPin = await hasPersonalPin();
      if (!hasPin) {
        setGate("setup");
        return;
      }
      if (await isPersonalUnlocked()) {
        setGate("open");
        await loadPrefs();
        return;
      }
      setGate("unlock");
    } catch {
      setGate("unlock");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      bootstrap();
      return () => {
        // Re-lock when leaving the screen
        lockPersonalSettings();
      };
    }, [bootstrap]),
  );

  async function loadPrefs() {
    try {
      const remote = await fetchPersonalCare();
      setPrefs(remote);
      if (remote.familyContactUserId) {
        try {
          const u = await fetchUserProfile(remote.familyContactUserId);
          if (u) {
            const name =
              `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
              u.username ||
              u.businessName ||
              "Family contact";
            setFamilyLabel(name);
          } else {
            setFamilyLabel("Family contact set");
          }
        } catch {
          setFamilyLabel("Family contact set");
        }
      } else {
        setFamilyLabel(null);
      }
    } catch {
      Alert.alert("Couldn’t load settings", "Check your connection and try again.");
    }
  }

  async function handleSetup() {
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      Alert.alert("Invalid PIN", "Use 4–6 digits.");
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert("PINs don’t match", "Enter the same PIN twice.");
      return;
    }
    setBusy(true);
    try {
      const { recoveryCode } = await setPersonalPin(pin);
      setRecoveryShown(recoveryCode);
      setPin("");
      setPinConfirm("");
      await loadPrefs();
      // Stay on setup until they acknowledge recovery code
    } catch (e: any) {
      Alert.alert("Couldn’t set PIN", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeRecovery() {
    setRecoveryShown(null);
    // First-time Personal mode: enable Safe Browse by default
    try {
      const saved = await savePersonalCare({ safeBrowseEnabled: true });
      setPrefs(saved);
    } catch {
      /* non-blocking */
    }
    setGate("open");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      const ok = await verifyPersonalPin(pin);
      if (!ok) {
        Alert.alert("Wrong PIN", "Try again, or use your recovery code.");
        setPin("");
        return;
      }
      setPin("");
      setGate("open");
      await loadPrefs();
    } catch (e: any) {
      Alert.alert("Locked", e?.message || "Try again later");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecoveryReset() {
    if (!recoveryInput.trim()) return;
    if (pin.length < 4 || pin.length > 6) {
      Alert.alert("Invalid PIN", "Choose a new 4–6 digit PIN.");
      return;
    }
    setBusy(true);
    try {
      await resetPersonalPinWithRecovery(recoveryInput, pin);
      setRecoveryInput("");
      setPin("");
      setGate("open");
      await loadPrefs();
      Alert.alert("PIN reset", "Your new Personal Settings PIN is ready.");
    } catch (e: any) {
      Alert.alert("Recovery failed", e?.message || "Check the code and try again");
    } finally {
      setBusy(false);
    }
  }

  async function patchPrefs(partial: Partial<PersonalCarePrefs>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    try {
      const saved = await savePersonalCare(partial);
      setPrefs(saved);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert("Couldn’t save", e?.message || "Try again");
      await loadPrefs();
    }
  }

  useEffect(() => {
    if (gate !== "open") return;
    const q = familyQuery.trim();
    if (q.length < 2) {
      setFamilyResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingFamily(true);
      try {
        const results = await searchUsers(q);
        if (!cancelled) setFamilyResults(results.slice(0, 8));
      } catch {
        if (!cancelled) setFamilyResults([]);
      } finally {
        if (!cancelled) setSearchingFamily(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [familyQuery, gate]);

  function renderGate() {
    if (gate === "loading") {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }

    if (recoveryShown) {
      return (
        <View style={styles.gateCard}>
          <Ionicons name="key-outline" size={36} color={Colors.primary} />
          <Text style={styles.gateTitle}>Save your recovery code</Text>
          <Text style={styles.gateBody}>
            Write this down and keep it somewhere safe. You’ll need it if you forget the PIN on this
            phone.
          </Text>
          <Text style={styles.recoveryCode} selectable>
            {recoveryShown}
          </Text>
          <Pressable style={styles.primaryBtn} onPress={acknowledgeRecovery}>
            <Text style={styles.primaryBtnText}>I’ve saved it</Text>
          </Pressable>
        </View>
      );
    }

    if (gate === "setup") {
      return (
        <View style={styles.gateCard}>
          <Ionicons name="lock-closed" size={36} color={Colors.primary} />
          <Text style={styles.gateTitle}>Create a Personal PIN</Text>
          <Text style={styles.gateBody}>
            Family manages Safe Browse and Companion behind this PIN so everyday Chat stays easy to
            use.
          </Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="New PIN (4–6 digits)"
            placeholderTextColor={Colors.textMuted}
            maxLength={6}
          />
          <TextInput
            style={styles.pinInput}
            value={pinConfirm}
            onChangeText={(t) => setPinConfirm(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="Confirm PIN"
            placeholderTextColor={Colors.textMuted}
            maxLength={6}
          />
          <Pressable
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={handleSetup}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Saving…" : "Set PIN"}</Text>
          </Pressable>
        </View>
      );
    }

    if (gate === "recovery") {
      return (
        <View style={styles.gateCard}>
          <Text style={styles.gateTitle}>Reset with recovery code</Text>
          <TextInput
            style={styles.pinInput}
            value={recoveryInput}
            onChangeText={setRecoveryInput}
            autoCapitalize="characters"
            placeholder="Recovery code"
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="New PIN"
            placeholderTextColor={Colors.textMuted}
            maxLength={6}
          />
          <Pressable
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={handleRecoveryReset}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>Reset PIN</Text>
          </Pressable>
          <Pressable onPress={() => setGate("unlock")}>
            <Text style={styles.linkText}>Back to unlock</Text>
          </Pressable>
        </View>
      );
    }

    // unlock
    return (
      <View style={styles.gateCard}>
        <Ionicons name="lock-closed" size={36} color={Colors.primary} />
        <Text style={styles.gateTitle}>Enter Personal PIN</Text>
        <Text style={styles.gateBody}>Managed by family — unlock to change care settings.</Text>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="PIN"
          placeholderTextColor={Colors.textMuted}
          maxLength={6}
          onSubmitEditing={handleUnlock}
        />
        <Pressable
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          onPress={handleUnlock}
          disabled={busy}
        >
          <Text style={styles.primaryBtnText}>{busy ? "Checking…" : "Unlock"}</Text>
        </Pressable>
        <Pressable onPress={() => setGate("recovery")}>
          <Text style={styles.linkText}>Forgot PIN? Use recovery code</Text>
        </Pressable>
      </View>
    );
  }

  function presetRow(
    label: string,
    presets: readonly number[],
    value: number,
    onPick: (n: number) => void,
    suffix = "h",
  ) {
    return (
      <View style={styles.presetBlock}>
        <Text style={styles.optionLabel}>{label}</Text>
        <View style={styles.presetRow}>
          {presets.map((n) => {
            const active = value === n;
            return (
              <Pressable
                key={n}
                onPress={() => onPick(n)}
                style={[styles.presetChip, active && styles.presetChipActive]}
              >
                <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                  {n}
                  {suffix}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          testID="personal-settings-back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Personal Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      {gate !== "open" || recoveryShown ? (
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.gateWrap} bottomOffset={24}>
          {renderGate()}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          <Text style={styles.intro}>
            Care options managed by family. Everyday Chat and Cledwyn stay available without this
            PIN.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Safe Browse</Text>
            <View style={styles.sectionCard}>
              <View style={styles.optionRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.optionLabel}>Child-safe search</Text>
                <Switch
                  value={prefs.safeBrowseEnabled}
                  onValueChange={(v) => patchPrefs({ safeBrowseEnabled: v })}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>
            <Text style={styles.hint}>
              When on, Browse uses Google SafeSearch suitable for children and vulnerable adults.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Companion</Text>
            <View style={styles.sectionCard}>
              <View style={styles.optionRow}>
                <Ionicons name="heart-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.optionLabel}>Cledwyn companion mode</Text>
                <Switch
                  value={prefs.companionEnabled}
                  onValueChange={(v) => patchPrefs({ companionEnabled: v })}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.optionRow}>
                <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.optionLabel}>Profile</Text>
                <Text style={styles.optionValue}>Dementia support</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Turns Cledwyn into a reassuring companion who remembers and checks in. Not a doctor or
              emergency service.
            </Text>
          </View>

          {prefs.companionEnabled && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Check-ins & alerts</Text>
                <View style={styles.sectionCard}>
                  {presetRow(
                    "Cledwyn check-in every",
                    CHECK_IN_INTERVAL_PRESETS,
                    prefs.checkInIntervalHours,
                    (n) => patchPrefs({ checkInIntervalHours: n }),
                  )}
                  {presetRow(
                    "Alert family after no reply for",
                    SILENCE_ALERT_PRESETS,
                    prefs.silenceAlertAfterHours,
                    (n) => patchPrefs({ silenceAlertAfterHours: n }),
                  )}
                </View>
                <Text style={styles.hint}>
                  Alerts send a Lekker Chat message to your chosen family contact. Pick longer
                  intervals overnight if needed.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Family contact</Text>
                <View style={styles.sectionCard}>
                  <View style={styles.optionRow}>
                    <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
                    <Text style={styles.optionLabel}>
                      {familyLabel || "No family contact selected"}
                    </Text>
                    {prefs.familyContactUserId ? (
                      <Pressable
                        onPress={() => {
                          setFamilyLabel(null);
                          patchPrefs({ familyContactUserId: null });
                        }}
                      >
                        <Text style={styles.clearText}>Clear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    style={styles.searchInput}
                    value={familyQuery}
                    onChangeText={setFamilyQuery}
                    placeholder="Search Lekker Chat username or name"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchingFamily ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginVertical: 8 }} />
                  ) : null}
                  {familyResults.map((u) => {
                    const name =
                      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                      u.username ||
                      "User";
                    return (
                      <Pressable
                        key={u.id}
                        style={styles.familyResult}
                        onPress={() => {
                          setFamilyLabel(name);
                          setFamilyQuery("");
                          setFamilyResults([]);
                          patchPrefs({ familyContactUserId: u.id });
                        }}
                      >
                        <Text style={styles.familyResultName}>{name}</Text>
                        {u.username ? (
                          <Text style={styles.familyResultMeta}>@{u.username}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>
                  They must already have a Lekker Chat account. Silence alerts arrive as a chat
                  message from this phone’s account, clearly labelled as a Companion alert.
                </Text>
              </View>
            </>
          )}
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: fontScale(17),
    color: Colors.text,
  },
  scroll: { paddingHorizontal: 16 },
  intro: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
    lineHeight: 20,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  optionLabel: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: fontScale(14),
    color: Colors.text,
  },
  optionValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
    marginHorizontal: 4,
    lineHeight: 18,
  },
  presetBlock: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  presetChipTextActive: { color: Colors.background },
  searchInput: {
    marginHorizontal: 14,
    marginBottom: 10,
    marginTop: 4,
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  familyResult: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  familyResultName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  familyResultMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  clearText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.danger,
  },
  gateWrap: { padding: 24, flexGrow: 1, justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  gateCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    alignItems: "center",
  },
  gateTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: fontScale(20),
    color: Colors.text,
    textAlign: "center",
  },
  gateBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  pinInput: {
    width: "100%",
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_500Medium",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
    letterSpacing: 4,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.background,
  },
  linkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.primary,
    marginTop: 8,
  },
  recoveryCode: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: Colors.primary,
    letterSpacing: 2,
    marginVertical: 8,
  },
});
