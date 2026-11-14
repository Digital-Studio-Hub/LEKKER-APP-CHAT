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
import { fetchSocialAccess, syncAgeRange, type SocialAccessStatus } from "@/lib/age-gate-api";
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
  /** Latest GET /api/user/social-access payload (DOB, source, cooldown) for Settings. */
  ageStatus: SocialAccessStatus | null;
  refreshAgeStatus: () => Promise<SocialAccessStatus | null>;
  /**
   * Settings → Account → Date of birth. Saves via POST /api/user/age-range (server enforces
   * validation, device-source guard and the 30-day cooldown) and updates gating in place.
   * Throws the apiRequest error on 400 / 409 / 429 so the caller can show the message.
   */
  changeDateOfBirth: (dateOfBirth: string) => Promise<{ socialMediaAllowed: boolean }>;
};

const AgeGateContext = createContext<AgeGateContextValue | null>(null);

export function AgeGateProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, user, updateProfile, applyServerUser } = useAuth();
  const [ageStatus, setAgeStatus] = useState<SocialAccessStatus | null>(null);
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
      setAgeStatus(status);
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

  const refreshAgeStatus = useCallback(async () => {
    if (!isLoggedIn) {
      setAgeStatus(null);
      return null;
    }
    try {
      const status = await fetchSocialAccess();
      setAgeStatus(status);
      setSocialMediaAllowed(status.socialMediaAllowed);
      setNeedsAgeDeclaration(status.needsAgeDeclaration);
      return status;
    } catch {
      return null;
    }
  }, [isLoggedIn]);

  const changeDateOfBirth = useCallback(async (dateOfBirth: string) => {
    setIsChecking(true);
    try {
      const result = await syncAgeRange({ dateOfBirth: dateOfBirth.trim(), source: "dob" });
      setSocialMediaAllowed(result.socialMediaAllowed);
      setNeedsAgeDeclaration(false);
      setShowDobPrompt(false);
      // Keep the local user in step (age fields aren't in updateProfile's allow-list).
      if (result.user) await applyServerUser(result.user as any);
      await refreshAgeStatus();
      return { socialMediaAllowed: result.socialMediaAllowed };
    } finally {
      setIsChecking(false);
    }
  }, [applyServerUser, refreshAgeStatus]);

  const value = useMemo(
    () => ({
      socialMediaAllowed,
      needsAgeDeclaration,
      isChecking,
      showDobPrompt,
      declareWithDevice,
      declareWithDateOfBirth,
      dismissDobPrompt: () => setShowDobPrompt(false),
      ageStatus,
      refreshAgeStatus,
      changeDateOfBirth,
    }),
    [
      socialMediaAllowed,
      needsAgeDeclaration,
      isChecking,
      showDobPrompt,
      declareWithDevice,
      declareWithDateOfBirth,
      ageStatus,
      refreshAgeStatus,
      changeDateOfBirth,
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