import { eq, or, type SQL } from "drizzle-orm";
import { cledwynCompanionMessages, personalCareSettings } from "@shared/schema";

/**
 * Personal Settings row belongs to the account being deleted.
 * `familyContactUserId` on someone else's row is not this user's data.
 */
export function personalCareSettingsBelongToUser(rowUserId: string, deletedUserId: string): boolean {
  return rowUserId === deletedUserId;
}

/**
 * Companion transcript lines are personal data when the deleted user owns the
 * thread (`userId`) or the line is about them (`aboutUserId`).
 */
export function companionMessageBelongsToUser(
  row: { userId: string; aboutUserId: string },
  deletedUserId: string,
): boolean {
  return row.userId === deletedUserId || row.aboutUserId === deletedUserId;
}

export function personalCareSettingsDeletionWhere(userId: string): SQL {
  return eq(personalCareSettings.userId, userId);
}

export function companionMessagesDeletionWhere(userId: string): SQL {
  const clause = or(
    eq(cledwynCompanionMessages.userId, userId),
    eq(cledwynCompanionMessages.aboutUserId, userId),
  );
  if (!clause) {
    throw new Error("companion message deletion filter was empty");
  }
  return clause;
}

type PersonalDataDeleter = {
  // `any` matches Drizzle's generic delete() and the test double.
  delete: (table: any) => {
    where: (clause: SQL) => Promise<unknown>;
  };
};

/** Removes Personal Settings and Cledwyn companion transcripts for one account. */
export async function deletePersonalCareAndCompanionData(
  executor: PersonalDataDeleter,
  userId: string,
): Promise<void> {
  await executor.delete(personalCareSettings).where(personalCareSettingsDeletionWhere(userId));
  await executor.delete(cledwynCompanionMessages).where(companionMessagesDeletionWhere(userId));
}
