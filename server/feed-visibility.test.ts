import assert from "node:assert/strict";
import test from "node:test";
import {
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
