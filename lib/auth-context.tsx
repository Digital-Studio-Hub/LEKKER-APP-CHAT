import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken, setAuthToken } from "@/lib/auth-token";

const TOKEN_KEY = "lekker_auth_token";
const USER_KEY = "lekker_auth_user";

async function secureGetItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function secureSetItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function secureDeleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export interface AuthUser {
  id: string;
  phone: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarColor: string | null;
  profilePhoto: string | null;
  bio: string | null;
  businessName: string | null;
  tradingName: string | null;
  lekkerNetworkId: string | null;
  isVerifiedLekkerpreneur: boolean;
  businessCategory: string | null;
  businessWebsite: string | null;
  businessLogoUrl: string | null;
  businessProvince: string | null;
  businessCountry: string | null;
  lekkerVerifiedAt: string | null;
  status: string | null;
  presence: string | null;
  lekkerNetworkAccess: boolean;
  lekkerWorkspaceId?: string | null;
  workspaceEmailActive?: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage: string | null;
  notificationsEnabled: boolean;
  locationEnabled: boolean;
  lastLatitude: string | null;
  lastLongitude: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  displayName?: string;
  phoneNumber?: string;
}

interface RegisterData {
  phone: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
}

interface LoginData {
  identifier: string;
  password: string;
}

interface WhatsAppVerifyData {
  phone: string;
  code: string;
  displayName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  register: (data: RegisterData) => Promise<{ success: boolean; errors?: any[] }>;
  login: (data: LoginData) => Promise<{ success: boolean; message?: string }>;
  verifyWhatsApp: (data: WhatsAppVerifyData) => Promise<{ success: boolean; needsDisplayName?: boolean; message?: string }>;
  updateProfile: (updates: Partial<AuthUser>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function enrichUser(user: AuthUser): AuthUser {
  return {
    ...user,
    displayName: `${user.firstName} ${user.lastName}`,
    phoneNumber: user.phone,
  };
}

async function storeToken(token: string) {
  setAuthToken(token);
  await secureSetItem(TOKEN_KEY, token);
}

async function storeUser(user: AuthUser) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function clearStorage() {
  setAuthToken(null);
  await secureDeleteItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
}

async function loadStoredToken(): Promise<string | null> {
  const token = await secureGetItem(TOKEN_KEY);
  setAuthToken(token);
  return token;
}

async function loadStoredUser(): Promise<AuthUser | null> {
  const userStr = await AsyncStorage.getItem(USER_KEY);
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const token = await loadStoredToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const storedUser = await loadStoredUser();
      if (storedUser) {
        setUser(enrichUser(storedUser));
      }

      try {
        const baseUrl = getApiUrl();
        const res = await fetch(`${baseUrl}api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const enriched = enrichUser(data.user);
          setUser(enriched);
          await storeUser(enriched);
        } else if (res.status === 401) {
          await clearStorage();
          setUser(null);
        }
      } catch (e) {
        if (storedUser) {
          setUser(enrichUser(storedUser));
        }
      }
    } catch (e) {
      console.error("Failed to load user:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function register(data: RegisterData): Promise<{ success: boolean; errors?: any[] }> {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (!res.ok) {
      return { success: false, errors: body.errors || [{ field: body.field || "general", message: body.message }] };
    }

    await storeToken(body.token);
    const enriched = enrichUser(body.user);
    await storeUser(enriched);
    setUser(enriched);
    return { success: true };
  }

  async function verifyWhatsApp(
    data: WhatsAppVerifyData,
  ): Promise<{ success: boolean; needsDisplayName?: boolean; message?: string }> {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/whatsapp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (body.needsDisplayName) {
      return { success: false, needsDisplayName: true };
    }
    if (!res.ok) {
      return { success: false, message: body.message };
    }
    await storeToken(body.token);
    const enriched = enrichUser(body.user);
    await storeUser(enriched);
    setUser(enriched);
    return { success: true };
  }

  async function login(data: LoginData): Promise<{ success: boolean; message?: string }> {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (!res.ok) {
      return { success: false, message: body.message };
    }

    await storeToken(body.token);
    const enriched = enrichUser(body.user);
    await storeUser(enriched);
    setUser(enriched);
    return { success: true };
  }

  async function updateProfile(updates: Partial<AuthUser>) {
    if (!user) return;

    const ALLOWED_FIELDS = new Set([
      "firstName", "lastName", "username", "bio", "businessName", "tradingName",
      "businessCategory", "businessWebsite", "businessLogoUrl", "businessProvince",
      "businessCountry", "status", "presence", "avatarColor", "profilePhoto",
      "autoReplyEnabled", "autoReplyMessage", "notificationsEnabled", "locationEnabled",
      "lastLatitude", "lastLongitude", "locationCity", "locationRegion",
    ]);

    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.has(key)) {
        filtered[key] = value;
      }
    }

    try {
      const baseUrl = getApiUrl();
      const token = getAuthToken();

      if (Object.keys(filtered).length > 0) {
        const res = await fetch(`${baseUrl}api/auth/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(filtered),
        });

        if (res.ok) {
          const data = await res.json();
          const enriched = enrichUser(data.user);
          setUser(enriched);
          await storeUser(enriched);
          return;
        }
      }

      const updated = enrichUser({ ...user, ...updates });
      setUser(updated);
      await storeUser(updated);
    } catch (e) {
      const updated = enrichUser({ ...user, ...updates });
      setUser(updated);
      await storeUser(updated);
    }
  }

  async function logout() {
    try {
      const baseUrl = getApiUrl();
      const token = getAuthToken();
      if (token) {
        await fetch(`${baseUrl}api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      await clearStorage();
      setUser(null);
    }
  }

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isLoggedIn: !!user,
      register,
      login,
      verifyWhatsApp,
      updateProfile,
      logout,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
