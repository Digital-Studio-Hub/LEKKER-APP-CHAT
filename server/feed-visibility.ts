/**
 * Newsfeed block filtering.
 *
 * Blocks are mutual for visibility, matching `storage.isEitherUserBlocked`:
 * a post or comment is hidden when either person has blocked the other.
 */

export type UserBlockEdge = {
  blockerId: string;
  blockedUserId: string;
};

/** Peer ids whose posts and comments `viewerId` must not see. */
export function hiddenAuthorIdsForViewer(viewerId: string, blocks: UserBlockEdge[]): Set<string> {
  const hidden = new Set<string>();
  if (!viewerId) return hidden;

  for (const block of blocks) {
    if (!block.blockerId || !block.blockedUserId) continue;
    if (block.blockerId === block.blockedUserId) continue;

    if (block.blockerId === viewerId) {
      hidden.add(block.blockedUserId);
    } else if (block.blockedUserId === viewerId) {
      hidden.add(block.blockerId);
    }
  }

  hidden.delete(viewerId);
  return hidden;
}

export function filterPostsByHiddenAuthors<T extends { authorId: string }>(
  posts: T[],
  hiddenAuthorIds: ReadonlySet<string>,
): T[] {
  if (hiddenAuthorIds.size === 0) return posts;
  return posts.filter((post) => !hiddenAuthorIds.has(post.authorId));
}

export function filterCommentsByHiddenAuthors<T extends { authorId: string }>(
  comments: T[],
  hiddenAuthorIds: ReadonlySet<string>,
): T[] {
  if (hiddenAuthorIds.size === 0) return comments;
  return comments.filter((comment) => !hiddenAuthorIds.has(comment.authorId));
}
