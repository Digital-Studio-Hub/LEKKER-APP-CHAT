import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth";
import { storage } from "./storage";
import { isSocialMediaAllowed } from "../shared/age-gate";

export const SOCIAL_ACCESS_DENIED = {
  message: "Social features are not available for your age group.",
  code: "SOCIAL_MEDIA_AGE_RESTRICTED",
} as const;

export async function userHasSocialMediaAccess(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user) return false;
  return isSocialMediaAllowed({
    lowerBound: user.ageRangeLowerBound,
    upperBound: user.ageRangeUpperBound,
    dateOfBirth: user.dateOfBirth,
    socialMediaAllowed: user.socialMediaAllowed,
  });
}

export async function requireSocialMediaAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user?.userId) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }
  const allowed = await userHasSocialMediaAccess(req.user.userId);
  if (!allowed) {
    res.status(403).json(SOCIAL_ACCESS_DENIED);
    return;
  }
  next();
}