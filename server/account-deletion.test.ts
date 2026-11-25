import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import { cledwynCompanionMessages, personalCareSettings } from "@shared/schema";
import {
  companionMessageBelongsToUser,
  companionMessagesDeletionWhere,
  deletePersonalCareAndCompanionData,
  personalCareSettingsBelongToUser,
  personalCareSettingsDeletionWhere,
} from "./account-deletion";

const dialect = new PgDialect();
const USER = "user-being-deleted";
const FAMILY = "family-member";
const STRANGER = "someone-else";

test("personal care deletion keeps only the deleted user's settings row", () => {
  const rows = [
    { userId: USER },
    { userId: FAMILY },
    { userId: STRANGER },
  ];
  assert.deepEqual(
    rows.filter((row) => personalCareSettingsBelongToUser(row.userId, USER)),
    [{ userId: USER }],
  );
});

test("companion deletion removes threads the user owns and threads about the user", () => {
  const rows = [
    { id: "own-thread", userId: USER, aboutUserId: USER },
    { id: "family-copy-about-user", userId: FAMILY, aboutUserId: USER },
    { id: "user-note-about-family", userId: USER, aboutUserId: FAMILY },
    { id: "unrelated", userId: FAMILY, aboutUserId: STRANGER },
  ];
  assert.deepEqual(
    rows.filter((row) => companionMessageBelongsToUser(row, USER)).map((row) => row.id),
    ["own-thread", "family-copy-about-user", "user-note-about-family"],
  );
});

test("deletion SQL targets personal_care_settings.user_id and companion user_id or about_user_id", () => {
  const settings = dialect.sqlToQuery(personalCareSettingsDeletionWhere(USER));
  assert.match(settings.sql, /"personal_care_settings"\."user_id"/);
  assert.equal(settings.sql.includes("family_contact"), false);
  assert.deepEqual(settings.params, [USER]);

  const messages = dialect.sqlToQuery(companionMessagesDeletionWhere(USER));
  assert.match(messages.sql, /"cledwyn_companion_messages"\."user_id"/);
  assert.match(messages.sql, /"cledwyn_companion_messages"\."about_user_id"/);
  assert.match(messages.sql, /\bor\b/i);
  assert.deepEqual(messages.params, [USER, USER]);
});

test("deletePersonalCareAndCompanionData deletes both tables with those filters", async () => {
  const calls: { table: object; sql: string; params: unknown[] }[] = [];
  await deletePersonalCareAndCompanionData(
    {
      delete(table) {
        return {
          async where(clause) {
            const query = dialect.sqlToQuery(clause);
            calls.push({ table, sql: query.sql, params: query.params });
          },
        };
      },
    },
    USER,
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, personalCareSettings);
  assert.match(calls[0].sql, /"personal_care_settings"\."user_id"/);
  assert.deepEqual(calls[0].params, [USER]);
  assert.equal(calls[1].table, cledwynCompanionMessages);
  assert.match(calls[1].sql, /"cledwyn_companion_messages"\."user_id"/);
  assert.match(calls[1].sql, /"cledwyn_companion_messages"\."about_user_id"/);
  assert.deepEqual(calls[1].params, [USER, USER]);
});

test("deleteUserAccount removes personal care settings and companion messages", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "storage.ts"), "utf8");
  const start = src.indexOf("async deleteUserAccount");
  const fn = src.slice(start, src.indexOf("\n  }", start));
  assert.match(fn, /deletePersonalCareAndCompanionData\(db, userId\)/);
  assert.ok(fn.indexOf("deletePersonalCareAndCompanionData") < fn.lastIndexOf("delete(users)"));
});
