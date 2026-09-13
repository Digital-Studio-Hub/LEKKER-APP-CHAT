import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchSchedule } from "@/lib/schedule-api";

const PREV_PRESENCE_KEY = "lekker_presence_before_meet_dnd";
const AUTO_DND_FLAG = "lekker_auto_dnd_from_meet";

type Presence = "online" | "away" | "dnd" | "offline";

/**
 * If a Lekker Meet or booking is active now, switch presence to DND
 * (remembering prior presence). When nothing is active, restore.
 */
export async function syncMeetAutoPresence(opts: {
  enabled: boolean;
  currentPresence: string | null | undefined;
  updatePresence: (presence: Presence) => Promise<void>;
}): Promise<{ active: boolean; changed: boolean }> {
  if (!opts.enabled) {
    return { active: false, changed: false };
  }

  try {
    const schedule = await fetchSchedule("today");
    if (!schedule.available) return { active: false, changed: false };

    const inMeeting = (schedule.activeNow || []).length > 0;
    const autoFlag = (await AsyncStorage.getItem(AUTO_DND_FLAG)) === "1";
    const current = (opts.currentPresence || "online") as Presence;

    if (inMeeting) {
      if (current !== "dnd") {
        await AsyncStorage.setItem(PREV_PRESENCE_KEY, current);
        await AsyncStorage.setItem(AUTO_DND_FLAG, "1");
        await opts.updatePresence("dnd");
        return { active: true, changed: true };
      }
      if (!autoFlag) {
        await AsyncStorage.setItem(PREV_PRESENCE_KEY, "online");
        await AsyncStorage.setItem(AUTO_DND_FLAG, "1");
      }
      return { active: true, changed: false };
    }

    // Meeting ended — restore only if we set DND automatically
    if (autoFlag && current === "dnd") {
      const prev = ((await AsyncStorage.getItem(PREV_PRESENCE_KEY)) || "online") as Presence;
      const restore: Presence = prev === "dnd" ? "online" : prev;
      await AsyncStorage.removeItem(AUTO_DND_FLAG);
      await AsyncStorage.removeItem(PREV_PRESENCE_KEY);
      await opts.updatePresence(restore);
      return { active: false, changed: true };
    }

    if (autoFlag) {
      await AsyncStorage.removeItem(AUTO_DND_FLAG);
      await AsyncStorage.removeItem(PREV_PRESENCE_KEY);
    }
    return { active: false, changed: false };
  } catch {
    return { active: false, changed: false };
  }
}
