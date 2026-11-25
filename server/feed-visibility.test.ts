import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  blockedAuthorExclusion,
  filterCommentsByHiddenAuthors,
  filterPostsByHiddenAuthors,
  hiddenAuthorIdsForViewer,
  type UserBlockEdge,
} from "./feed-visibility";

const VIEWER = "viewer";
const AUTHOR = "author";
const COMMENTER = "commenter";
const OTHER = "other";

test("hidden authors include people the viewer blocked and people who blocked the viewer", () => {
  const blocks: UserBlockEdge[] = [
    { blockerId: VIEWER, blockedUserId: AUTHOR },
    { blockerId: COMMENTER, blockedUserId: VIEWER },
    { blockerId: OTHER, blockedUserId: "stranger" },
    { blockerId: VIEWER, blockedUserId: VIEWER },
  ];

  const hidden = hiddenAuthorIdsForViewer(VIEWER, blocks);
  assert.deepEqual([...hidden].sort(), [AUTHOR, COMMENTER].sort());
  assert.equal(hidden.has(VIEWER), false);
  assert.equal(hidden.has(OTHER), false);
  assert.equal(hidden.has("stranger"), false);
});

test("listFeedPosts-style filtering drops blocked authors in both directions and keeps everyone else", () => {
  const blocks: UserBlockEdge[] = [
    { blockerId: VIEWER, blockedUserId: AUTHOR },
    { blockerId: "blocked-viewer", blockedUserId: VIEWER },
  ];
  const hidden = hiddenAuthorIdsForViewer(VIEWER, blocks);
  const posts = [
    { id: "own", authorId: VIEWER },
    { id: "blocked-by-me", authorId: AUTHOR },
    { id: "blocked-me", authorId: "blocked-viewer" },
    { id: "public", authorId: OTHER },
  ];

  assert.deepEqual(
    filterPostsByHiddenAuthors(posts, hidden).map((post) => post.id),
    ["own", "public"],
  );
});

test("hydratePosts-style filtering removes comments from blocked authors only", () => {
  const hidden = hiddenAuthorIdsForViewer(VIEWER, [
    { blockerId: VIEWER, blockedUserId: COMMENTER },
  ]);
  const comments = [
    { id: "c1", authorId: COMMENTER, content: "hidden" },
    { id: "c2", authorId: OTHER, content: "visible" },
    { id: "c3", authorId: VIEWER, content: "mine" },
  ];

  assert.deepEqual(
    filterCommentsByHiddenAuthors(comments, hidden).map((comment) => comment.id),
    ["c2", "c3"],
  );
});

test("no blocks leaves posts and comments unchanged", () => {
  const hidden = hiddenAuthorIdsForViewer(VIEWER, []);
  const posts = [{ id: "p1", authorId: AUTHOR }];
  const comments = [{ id: "c1", authorId: AUTHOR }];
  assert.equal(filterPostsByHiddenAuthors(posts, hidden), posts);
  assert.equal(filterCommentsByHiddenAuthors(comments, hidden), comments);
});

test("a page still fills when the newest posts are from blocked authors", () => {
  const hidden = hiddenAuthorIdsForViewer(VIEWER, [
    { blockerId: VIEWER, blockedUserId: "blocked" },
  ]);
  const newestFirst = [
    ...Array.from({ length: 40 }, (_, i) => ({ id: `blocked-${i}`, authorId: "blocked" })),
    { id: "visible-1", authorId: OTHER },
    { id: "visible-2", authorId: VIEWER },
  ];
  const page = filterPostsByHiddenAuthors(newestFirst, hidden).slice(0, 20);
  assert.deepEqual(
    page.map((post) => post.id),
    ["visible-1", "visible-2"],
  );
});

test("blocked-author exclusion is a bidirectional NOT EXISTS on user_blocks", () => {
  const query = new PgDialect().sqlToQuery(blockedAuthorExclusion(VIEWER));
  assert.match(query.sql, /not exists/i);
  assert.match(query.sql, /user_blocks/);
  assert.match(query.sql, /blocker_id/);
  assert.match(query.sql, /blocked_user_id/);
  assert.match(query.sql, /"feed_posts"\."author_id"/);
  assert.equal(query.params.filter((param) => param === VIEWER).length, 2);
});

test("listFeedPosts applies the block exclusion before the page limit", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "feed.ts"), "utf8");
  const fn = src.slice(
    src.indexOf("export async function listFeedPosts"),
    src.indexOf("export async function getFeedPostById"),
  );
  const exclusion = fn.indexOf("blockedAuthorExclusion");
  const limit = fn.indexOf(".limit(");
  assert.ok(exclusion >= 0 && limit >= 0 && exclusion < limit);
});

test("a block that does not involve the viewer hides nothing", () => {
  const hidden = hiddenAuthorIdsForViewer(VIEWER, [
    { blockerId: AUTHOR, blockedUserId: OTHER },
  ]);
  assert.equal(hidden.size, 0);
  assert.deepEqual(
    filterPostsByHiddenAuthors(
      [
        { id: "a", authorId: AUTHOR },
        { id: "b", authorId: OTHER },
      ],
      hidden,
    ).map((post) => post.id),
    ["a", "b"],
  );
});
