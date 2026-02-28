import { Platform, Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { Audio } from "expo-av";
import { ChatMessage } from "@/lib/storage";

function showPermissionDeniedAlert(feature: string) {
  Alert.alert(
    `${feature} Access Denied`,
    `Please enable ${feature.toLowerCase()} access in your device settings to use this feature.`,
    Platform.OS !== "web"
      ? [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      : [{ text: "OK" }],
  );
}

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export async function pickImage(): Promise<Partial<ChatMessage> | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    showPermissionDeniedAlert("Photos");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return {
    type: "image",
    imageUri: result.assets[0].uri,
  };
}

export async function takePhoto(): Promise<Partial<ChatMessage> | null> {
  if (Platform.OS === "web") {
    return pickImage();
  }
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== "granted") {
    showPermissionDeniedAlert("Camera");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.7,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return {
    type: "image",
    imageUri: result.assets[0].uri,
  };
}

export async function pickDocument(): Promise<Partial<ChatMessage> | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    return {
      type: "file",
      fileUri: asset.uri,
      fileName: asset.name,
      fileSize: asset.size,
    };
  } catch {
    return null;
  }
}

export async function shareLocation(): Promise<Partial<ChatMessage> | null> {
  if (Platform.OS === "web") {
    return shareLocationWeb();
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") {
    showPermissionDeniedAlert("Location");
    return null;
  }
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    let locationName = "My Location";
    try {
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (geocode[0]) {
        const parts = [geocode[0].street, geocode[0].city, geocode[0].region].filter(Boolean);
        if (parts.length > 0) locationName = parts.join(", ");
      }
    } catch {}
    return {
      type: "location",
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      locationName,
    };
  } catch {
    Alert.alert("Error", "Could not get your current location.");
    return null;
  }
}

function shareLocationWeb(): Promise<Partial<ChatMessage> | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      Alert.alert("Not Supported", "Your browser does not support location services.");
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          type: "location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          locationName: "My Location",
        });
      },
      () => {
        showPermissionDeniedAlert("Location");
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  });
}

export async function shareContact(): Promise<Partial<ChatMessage> | null> {
  if (Platform.OS === "web") {
    Alert.alert("Not Available", "Contact sharing is not available on web.");
    return null;
  }
  const perm = await Contacts.requestPermissionsAsync();
  if (perm.status !== "granted") {
    showPermissionDeniedAlert("Contacts");
    return null;
  }
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    pageSize: 100,
    sort: Contacts.SortTypes.FirstName,
  });
  if (!data || data.length === 0) {
    Alert.alert("No Contacts", "No contacts found on your device.");
    return null;
  }
  return new Promise((resolve) => {
    const names = data
      .filter((c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
      .slice(0, 20);
    if (names.length === 0) {
      Alert.alert("No Contacts", "No contacts with phone numbers found.");
      resolve(null);
      return;
    }
    const buttons = names.map((contact) => ({
      text: `${contact.name} (${contact.phoneNumbers![0].number})`,
      onPress: () => {
        resolve({
          type: "contact" as const,
          sharedContactName: contact.name || "Unknown",
          sharedContactPhone: contact.phoneNumbers![0].number || "",
        });
      },
    }));
    buttons.push({ text: "Cancel", onPress: () => resolve(null) });
    Alert.alert("Share Contact", "Select a contact to share", buttons);
  });
}

export interface VoiceRecorder {
  recording: Audio.Recording | null;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Partial<ChatMessage> | null>;
}

export async function startVoiceRecording(): Promise<Audio.Recording | null> {
  try {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      showPermissionDeniedAlert("Microphone");
      return null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    return recording;
  } catch {
    Alert.alert("Error", "Could not start recording.");
    return null;
  }
}

export async function stopVoiceRecording(
  recording: Audio.Recording,
): Promise<Partial<ChatMessage> | null> {
  try {
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
    const uri = recording.getURI();
    const status = await recording.getStatusAsync();
    if (!uri) return null;
    return {
      type: "voicenote",
      audioUri: uri,
      audioDuration: Math.round((status.durationMillis || 0) / 1000),
    };
  } catch {
    return null;
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
