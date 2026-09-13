import { z } from "zod";

/** Expo push categories — must match Settings toggles and push.ts gates. */
export const NOTIFICATION_CATEGORIES = [
  "messages_dm",
  "messages_group",
  "enquiries",
  "companion",
  "schedule",
  "workspace",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages_dm: true,
  messages_group: true,
  enquiries: true,
  companion: true,
  schedule: true,
  workspace: true,
};

export const notificationPreferencesSchema = z.object({
  messages_dm: z.boolean().optional(),
  messages_group: z.boolean().optional(),
  enquiries: z.boolean().optional(),
  companion: z.boolean().optional(),
  schedule: z.boolean().optional(),
  workspace: z.boolean().optional(),
});

export const NOTIFICATION_CATEGORY_META: Array<{
  id: NotificationCategory;
  label: string;
  hint: string;
}> = [
  {
    id: "messages_dm",
    label: "Direct messages",
    hint: "1:1 chats with people",
  },
  {
    id: "messages_group",
    label: "Group chats",
    hint: "Messages in groups",
  },
  {
    id: "enquiries",
    label: "Enquiries",
    hint: "Directory, website, and Marketplace enquiry replies",
  },
  {
    id: "companion",
    label: "Companion care",
    hint: "Cledwyn check-ins and family silence alerts",
  },
  {
    id: "schedule",
    label: "Schedule & Meet",
    hint: "Meeting reminders and calendar alerts",
  },
  {
    id: "workspace",
    label: "Workspace updates",
    hint: "Leads, orders, mail, and lekker.network alerts",
  },
];

/** Categories that may still notify while presence is DND. */
export const DND_BYPASS_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "companion", // family silence / care
  "schedule", // meeting starting now
]);

export function parseNotificationPreferences(raw: unknown): NotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!raw) return base;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!obj || typeof obj !== "object") return base;
  const parsed = notificationPreferencesSchema.safeParse(obj);
  if (!parsed.success) return base;
  return { ...base, ...parsed.data };
}

export function stringifyNotificationPreferences(prefs: NotificationPreferences): string {
  return JSON.stringify(prefs);
}
