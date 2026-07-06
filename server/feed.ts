import { createHash } from "crypto";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "./storage";
import { feedComments, feedLikes, feedPosts, feedShares, users } from "@shared/schema";

export type FeedPostDto = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  authorProfilePhoto?: string | null;
  content: string;
  mediaUrl?: string | null;
  createdAt: string;
  likes: string[];
  comments: Array<{
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: string;
  }>;
  shares: string[];
  contentHash: string;
};

function hashContent(content: string): string {
  return createHash("sha256").update(content.toLowerCase().trim()).digest("hex").slice(0, 16);
}

async function hydratePosts(postRows: typeof feedPosts.$inferSelect[]): Promise<FeedPostDto[]> {
  if (postRows.length === 0) return [];
  const postIds = postRows.map((p) => p.id);
  const authorIds = [...new Set(postRows.map((p) => p.authorId))];

  const authors = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarColor: users.avatarColor,
      profilePhoto: users.profilePhoto,
    })
    .from(users)
    .where(inArray(users.id, authorIds));
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const likes = await db.select().from(feedLikes).where(inArray(feedLikes.postId, postIds));
  const comments = await db
    .select()
    .from(feedComments)
    .where(inArray(feedComments.postId, postIds))
    .orderBy(feedComments.createdAt);
  const shares = await db.select().from(feedShares).where(inArray(feedShares.postId, postIds));

  const commentAuthorIds = [...new Set(comments.map((c) => c.authorId))];
  const commentAuthors = commentAuthorIds.length
    ? await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, commentAuthorIds))
    : [];
  const commentAuthorMap = new Map(
    commentAuthors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]),
  );

  const likesByPost = new Map<string, string[]>();
  for (const l of likes) {
    const arr = likesByPost.get(l.postId) || [];
    arr.push(l.userId);
    likesByPost.set(l.postId, arr);
  }

  const commentsByPost = new Map<string, FeedPostDto["comments"]>();
  for (const c of comments) {
    const arr = commentsByPost.get(c.postId) || [];
    arr.push({
      id: c.id,
      authorId: c.authorId,
      authorName: commentAuthorMap.get(c.authorId) || "User",
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    });
    commentsByPost.set(c.postId, arr);
  }

  const sharesByPost = new Map<string, string[]>();
  for (const s of shares) {
    const arr = sharesByPost.get(s.postId) || [];
    arr.push(s.userId);
    sharesByPost.set(s.postId, arr);
  }

  return postRows.map((p) => {
    const author = authorMap.get(p.authorId);
    return {
      id: p.id,
      authorId: p.authorId,
      authorName: author ? `${author.firstName} ${author.lastName}`.trim() : "User",
      authorAvatarColor: author?.avatarColor || "#F5B800",
      authorProfilePhoto: author?.profilePhoto,
      content: p.content,
      mediaUrl: p.mediaUrl,
      createdAt: p.createdAt.toISOString(),
      likes: likesByPost.get(p.id) || [],
      comments: commentsByPost.get(p.id) || [],
      shares: sharesByPost.get(p.id) || [],
      contentHash: p.contentHash,
    };
  });
}

export async function listFeedPosts(opts: {
  viewerId: string;
  authorId?: string;
  page?: number;
  limit?: number;
}): Promise<FeedPostDto[]> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, Math.max(1, opts.limit || 20));
  const offset = (page - 1) * limit;
  const now = new Date();

  const visibility = or(
    gt(feedPosts.expiresAt, now),
    sql`EXISTS (SELECT 1 FROM feed_shares WHERE feed_shares.post_id = ${feedPosts.id})`,
  );

  const conditions = [visibility];
  if (opts.authorId) {
    conditions.push(eq(feedPosts.authorId, opts.authorId));
  }

  const rows = await db
    .select()
    .from(feedPosts)
    .where(and(...conditions))
    .orderBy(desc(feedPosts.createdAt))
    .limit(limit)
    .offset(offset);

  return hydratePosts(rows);
}

export async function getFeedPostById(postId: string): Promise<FeedPostDto | null> {
  const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, postId)).limit(1);
  if (!row) return null;
  const [dto] = await hydratePosts([row]);
  return dto || null;
}

export async function createFeedPost(input: {
  authorId: string;
  content: string;
  mediaUrl?: string | null;
}): Promise<FeedPostDto | "duplicate" | null> {
  const contentHash = hashContent(input.content);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [dup] = await db
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(
      and(
        eq(feedPosts.authorId, input.authorId),
        eq(feedPosts.contentHash, contentHash),
        gt(feedPosts.createdAt, since),
      ),
    )
    .limit(1);

  if (dup) return "duplicate";

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(feedPosts)
    .values({
      authorId: input.authorId,
      content: input.content,
      mediaUrl: input.mediaUrl || null,
      contentHash,
      expiresAt,
    })
    .returning();

  const [dto] = await hydratePosts([row]);
  return dto || null;
}

export async function toggleFeedLike(postId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(feedLikes)
    .where(and(eq(feedLikes.postId, postId), eq(feedLikes.userId, userId)))
    .limit(1);

  if (existing) {
    await db.delete(feedLikes).where(eq(feedLikes.id, existing.id));
    return;
  }

  await db.insert(feedLikes).values({ postId, userId });
}

export async function addFeedShare(postId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(feedShares)
    .where(and(eq(feedShares.postId, postId), eq(feedShares.userId, userId)))
    .limit(1);

  if (!existing) {
    await db.insert(feedShares).values({ postId, userId });
  }

  // Shared posts stay visible — extend expiry
  await db
    .update(feedPosts)
    .set({ expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
    .where(eq(feedPosts.id, postId));
}

export async function addFeedComment(input: {
  postId: string;
  authorId: string;
  content: string;
}): Promise<void> {
  await db.insert(feedComments).values({
    postId: input.postId,
    authorId: input.authorId,
    content: input.content,
  });
}