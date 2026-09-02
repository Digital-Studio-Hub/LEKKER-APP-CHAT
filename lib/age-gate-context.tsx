import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { fetchSocialAccess, syncAgeRange } from "@/lib/age-gate-api";
import { resolveDeviceAgeRange } from "@/lib/resolve-age-range";
import { isSocialMediaAllowed } from "@shared/age-gate";

type AgeGateContextValue = {
  socialMediaAllowed: boolean;
  needsAgeDeclaration: boolean;
  isChecking: boolean;
  showDobPrompt: boolean;
  declareWithDevice: () => Promise<void>;
  declareWithDateOfBirth: (dateOfBirth: string) => Promise<void>;
  dismissDobPrompt: () => void;
};

const AgeGateContext = createContext<AgeGateContextValue | null>(null);

export function AgeGateProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, user, updateProfile } = useAuth();
  const [socialMediaAllowed, setSocialMediaAllowed] = useState(false);
  const [needsAgeDeclaration, setNeedsAgeDeclaration] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showDobPrompt, setShowDobPrompt] = useState(false);

  const applyUserAge = useCallback((u: typeof user) => {
    if (!u) return;
    const allowed = isSocialMediaAllowed({
      lowerBound: (u as any).ageRangeLowerBound,
      upperBound: (u as any).ageRangeUpperBound,
      dateOfBirth: (u as any).dateOfBirth,
      socialMediaAllowed: (u as any).socialMediaAllowed,
    });
    setSocialMediaAllowed(allowed);
    setNeedsAgeDeclaration(!(u as any).ageRangeDeclaredAt && (u as any).socialMediaAllowed == null);
  }, []);

  const refreshAccess = useCallback(async () => {
    if (!isLoggedIn) {
      setSocialMediaAllowed(false);
      setNeedsAgeDeclaration(false);
      return;
    }
    setIsChecking(true);
    try {
      const status = await fetchSocialAccess();
      setSocialMediaAllowed(status.socialMediaAllowed);
      setNeedsAgeDeclaration(status.needsAgeDeclaration);
      if (status.needsAgeDeclaration && Platform.OS !== "web") {
        const resolved = await resolveDeviceAgeRange();
        if (resolved.source === "apple" || resolved.source === "google") {
          const result = await syncAgeRange({
            lowerBound: resolved.lowerBound,
            upperBound: resolved.upperBound,
            source: resolved.source,
          });
          setSocialMediaAllowed(result.socialMediaAllowed);
          setNeedsAgeDeclaration(false);
          if (result.user) await updateProfile(result.user as any);
          return;
        }
        setShowDobPrompt(true);
      } else if (status.needsAgeDeclaration && Platform.OS === "web") {
        setShowDobPrompt(true);
      }
    } catch {
      applyUserAge(user);
    } finally {
      setIsChecking(false);
    }
  }, [isLoggedIn, user, applyUserAge, updateProfile]);

  useEffect(() => {
    if (user) applyUserAge(user);
  }, [user, applyUserAge]);

  useEffect(() => {
    if (isLoggedIn) {
      refreshAccess();
    }
  }, [isLoggedIn]);

  const declareWithDevice = useCallback(async () => {
    setIsChecking(true);
    try {
      const resolved = await resolveDeviceAgeRange();
      const result = await syncAgeRange({
        lowerBound: resolved.lowerBound,
        upperBound: resolved.upperBound,
        source: resolved.source,
      });
      setSocialMediaAllowed(result.socialMediaAllowed);
      setNeedsAgeDeclaration(false);
      setShowDobPrompt(false);
      if (result.user) await updateProfile(result.user as any);
    } finally {
      setIsChecking(false);
    }
  }, [updateProfile]);

  const declareWithDateOfBirth = useCallback(async (dateOfBirth: string) => {
    setIsChecking(true);
    try {
      const result = await syncAgeRange({ dateOfBirth, source: "dob" });
      setSocialMediaAllowed(result.socialMediaAllowed);
      setNeedsAgeDeclaration(false);
      setShowDobPrompt(false);
      if (result.user) await updateProfile(result.user as any);
    } finally {
      setIsChecking(false);
    }
  }, [updateProfile]);

  const value = useMemo(
    () => ({
      socialMediaAllowed,
      needsAgeDeclaration,
      isChecking,
      showDobPrompt,
      declareWithDevice,
      declareWithDateOfBirth,
      dismissDobPrompt: () => setShowDobPrompt(false),
    }),
    [
      socialMediaAllowed,
      needsAgeDeclaration,
      isChecking,
      showDobPrompt,
      declareWithDevice,
      declareWithDateOfBirth,
    ],
  );

  return <AgeGateContext.Provider value={value}>{children}</AgeGateContext.Provider>;
}

export function useAgeGate(): AgeGateContextValue {
  const ctx = useContext(AgeGateContext);
  if (!ctx) {
    throw new Error("useAgeGate must be used within AgeGateProvider");
  }
  return ctx;
}