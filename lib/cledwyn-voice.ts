import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { apiRequest } from "@/lib/query-client";
import { startVoiceRecording, stopVoiceRecording } from "@/lib/chat-attachments";

export { startVoiceRecording, stopVoiceRecording };

export async function transcribeCledwynAudio(localUri: string): Promise<string> {
  let base64: string;
  if (Platform.OS === "web") {
    const res = await fetch(localUri);
    const blob = await res.blob();
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result || "");
        const idx = dataUrl.indexOf(",");
        resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error("Failed to read audio"));
      reader.readAsDataURL(blob);
    });
  } else {
    base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64" as any,
    });
  }

  const contentType =
    localUri.includes(".webm")
      ? "audio/webm"
      : localUri.includes(".wav")
        ? "audio/wav"
        : "audio/m4a";

  const res = await apiRequest("POST", "/api/cledwyn/stt", {
    audioBase64: base64,
    contentType,
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.text) {
    throw new Error(data.message || "Could not understand that — try again");
  }
  return String(data.text).trim();
}

export async function resetAudioModeAfterRecording(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
  } catch {
    /* ignore */
  }
}
