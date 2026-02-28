import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCATION_KEY = "lekker_location_enabled";
const LAST_LOCATION_KEY = "lekker_last_location";

export interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  timestamp: string;
}

export async function requestLocationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc: UserLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString(),
          };
          await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
          await AsyncStorage.setItem(LOCATION_KEY, "true");
          resolve(true);
        },
        () => resolve(false),
        { timeout: 10000 },
      );
    });
  }

  try {
    const Location = await import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return false;

    await AsyncStorage.setItem(LOCATION_KEY, "true");

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const loc: UserLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: new Date().toISOString(),
    };

    try {
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (geocode) {
        loc.city = geocode.city || geocode.subregion || undefined;
        loc.region = geocode.region || undefined;
      }
    } catch (e) {}

    await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
    return true;
  } catch (e) {
    console.error("Location error:", e);
    return false;
  }
}

export async function isLocationEnabled(): Promise<boolean> {
  if (Platform.OS === "web") {
    const stored = await AsyncStorage.getItem(LOCATION_KEY);
    return stored === "true";
  }

  try {
    const Location = await import("expo-location");
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      await AsyncStorage.removeItem(LOCATION_KEY);
      await AsyncStorage.removeItem(LAST_LOCATION_KEY);
      return false;
    }
  } catch (e) {}

  const stored = await AsyncStorage.getItem(LOCATION_KEY);
  return stored === "true";
}

export async function getLastLocation(): Promise<UserLocation | null> {
  const data = await AsyncStorage.getItem(LAST_LOCATION_KEY);
  return data ? JSON.parse(data) : null;
}

export async function updateLocation(): Promise<UserLocation | null> {
  const enabled = await isLocationEnabled();
  if (!enabled) return null;

  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc: UserLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString(),
          };
          await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
          resolve(loc);
        },
        () => resolve(null),
        { timeout: 10000 },
      );
    });
  }

  try {
    const Location = await import("expo-location");
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const loc: UserLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: new Date().toISOString(),
    };

    try {
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (geocode) {
        loc.city = geocode.city || geocode.subregion || undefined;
        loc.region = geocode.region || undefined;
      }
    } catch (e) {}

    await AsyncStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
    return loc;
  } catch (e) {
    console.error("Location update error:", e);
    return null;
  }
}

export async function disableLocation(): Promise<void> {
  await AsyncStorage.removeItem(LOCATION_KEY);
  await AsyncStorage.removeItem(LAST_LOCATION_KEY);
}
