/**
 * Pre-create the Apple App Review test account (optional).
 * The reviewer can also sign in via the normal WhatsApp UI — no OTP is sent
 * when APPLE_REVIEW_PHONE + APPLE_REVIEW_CODE are set on the server.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-apple-reviewer.ts
 */
import { getAppleReviewConfig } from "../server/apple-review-auth";
import { storage } from "../server/storage";
import { phoneToPlaceholderEmail, phoneToUsername } from "../shared/mobile-utils";

const AVATAR_COLORS = ["#4ECDC4", "#FF6B6B", "#45B7D1", "#96CEB4", "#FFEAA7"];

async function resolveUniqueUsername(phone: string): Promise<string> {
  let base = phoneToUsername(phone);
  let candidate = base;
  let n = 0;
  while (await storage.getUserByUsername(candidate)) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}

async function main() {
  const config = getAppleReviewConfig();
  if (!config) {
    console.error("Set APPLE_REVIEW_PHONE and APPLE_REVIEW_CODE in .env first.");
    process.exit(1);
  }

  const existing = await storage.getUserByPhone(config.phone);
  if (existing) {
    await storage.updateUser(existing.id, { phoneVerified: true, emailVerified: true });
    const emails = await storage.getUserEmails(existing.id);
    for (const row of emails) {
      if (!row.isVerified) await storage.verifyUserEmail(row.id, existing.id);
    }
    console.log(`Reviewer account already exists: ${existing.id} (${config.phone})`);
    process.exit(0);
  }

  const email = phoneToPlaceholderEmail(config.phone);
  const username = await resolveUniqueUsername(config.phone);
  const user = await storage.createUser({
    phone: config.phone,
    email,
    username,
    firstName: config.displayName,
    lastName: "",
    passwordHash: null,
    avatarColor: AVATAR_COLORS[0],
    role: "user",
    emailVerified: true,
    phoneVerified: true,
    lekkerNetworkAccess: false,
    autoReplyEnabled: false,
    notificationsEnabled: true,
    locationEnabled: false,
    presence: "online",
  } as any);

  await storage.addUserEmail(user.id, email, true, true);
  console.log(`Created reviewer account: ${user.id}`);
  console.log(`  Phone: ${config.phone}`);
  console.log(`  Code:  ${config.code} (enter in app — no WhatsApp message is sent)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});