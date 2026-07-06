import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CONTACTS_BOOK_CONSENT_KEY = "lekker_contacts_book_consent_v1";

export const CONTACTS_SERVER_DISCLOSURE =
  "When you share a contact card in a chat, that contact's name and phone number are uploaded to Lekker Chat servers and delivered to the conversation participants. We do not upload your full address book.";

export async function ensureContactsBookConsent(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const accepted = await AsyncStorage.getItem(CONTACTS_BOOK_CONSENT_KEY);
  if (accepted === "true") return true;

  return new Promise((resolve) => {
    Alert.alert(
      "Find friends on your device",
      "Lekker Chat can read your contacts on this device to help you find people you know. Your address book is never uploaded to our servers — matching happens locally on your phone.",
      [
        { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Continue",
          onPress: async () => {
            await AsyncStorage.setItem(CONTACTS_BOOK_CONSENT_KEY, "true");
            resolve(true);
          },
        },
      ],
    );
  });
}

export function confirmContactShareUpload(
  contactName: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Share contact to chat?",
      `${CONTACTS_SERVER_DISCLOSURE}\n\nShare ${contactName} with this conversation?`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Share", onPress: () => resolve(true) },
      ],
    );
  });
}