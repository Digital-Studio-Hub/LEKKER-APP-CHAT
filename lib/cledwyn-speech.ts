import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SPEAK_PREF_KEY = "lekker_cledwyn_speak_replies";

let Speech: typeof import("expo-speech") | null = null;

async function getSpeech() {
  if (Speech) return Speech;
  if (Platform.OS === "web") return null;
  try {
    Speech = await import("expo-speech");
    return Speech;
  } catch {
    return null;
  }
}

/** Local device preference (master for Chat TTS). Default on for companion-friendly UX; user can mute. */
export async function getCledwynSpeakEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SPEAK_PREF_KEY);
    if (v === null) return true; // default: speak replies
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export async function setCledwynSpeakEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(SPEAK_PREF_KEY, on ? "1" : "0");
  if (!on) await stopCledwynSpeech();
}

export async function stopCledwynSpeech(): Promise<void> {
  const S = await getSpeech();
  if (!S) return;
  try {
    await S.stop();
  } catch {
    /* ignore */
  }
}

/** Strip markdown-ish noise for clearer TTS. */
export function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Speak Cledwyn's reply on-device (expo-speech).
 * No-ops on web or if speak preference is off.
 */
export async function speakCledwynReply(text: string, opts?: { force?: boolean }): Promise<void> {
  if (Platform.OS === "web") return;
  if (!opts?.force) {
    const on = await getCledwynSpeakEnabled();
    if (!on) return;
  }
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned || cleaned.length < 2) return;

  const S = await getSpeech();
  if (!S) return;

  try {
    const speaking = await S.isSpeakingAsync();
    if (speaking) await S.stop();
  } catch {
    /* ignore */
  }

  // Cap length so OS TTS doesn't run forever on long answers
  const chunk = cleaned.length > 800 ? `${cleaned.slice(0, 780)}…` : cleaned;

  await new Promise<void>((resolve) => {
    S!.speak(chunk, {
      language: "en-ZA",
      pitch: 1.0,
      rate: Platform.OS === "ios" ? 0.52 : 0.95,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}
