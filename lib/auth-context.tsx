import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { storage, UserProfile } from "@/lib/storage";

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (phoneNumber: string, displayName: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const profile = await storage.getUserProfile();
      setUser(profile);
    } catch (e) {
      console.error("Failed to load user:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(phoneNumber: string, displayName: string) {
    const profile = await storage.createUserProfile(phoneNumber, displayName);
    setUser(profile);
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!user) return;
    const updated = { ...user, ...updates };
    await storage.saveUserProfile(updated);
    setUser(updated);
  }

  async function logout() {
    await storage.clearAll();
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isLoggedIn: !!user,
      login,
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
