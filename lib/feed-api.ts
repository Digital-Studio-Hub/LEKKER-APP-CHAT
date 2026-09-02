import { apiRequest } from "@/lib/query-client";

export type FeedComment = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarColor: string;
  authorProfilePhoto?: string | null;
  content: string;
  mediaUrl?: string | null;
  createdAt: string;
  likes: string[];
  comments: FeedComment[];
  shares: string[];
  contentHash: string;
};

export async function fetchFeedPosts(opts?: {
  page?: number;
  authorId?: string;
}): Promise<FeedPost[]> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.authorId) params.set("authorId", opts.authorId);
  const qs = params.toString();
  const res = await apiRequest("GET", `/api/feed${qs ? `?${qs}` : ""}`);
  const data = await res.json();
  return data.posts || [];
}

export async function fetchFeedPost(postId: string): Promise<FeedPost | null> {
  try {
    const res = await apiRequest("GET", `/api/feed/${postId}`);
    const data = await res.json();
    return data.post || null;
  } catch {
    return null;
  }
}

export async function createFeedPost(input: {
  content: string;
  mediaUrl?: string | null;
}): Promise<{ post: FeedPost | null; duplicate?: boolean; message?: string }> {
  const res = await apiRequest("POST", "/api/feed", input);
  return await res.json();
}

export async function toggleFeedLike(postId: string): Promise<void> {
  await apiRequest("POST", `/api/feed/${postId}/like`);
}

export async function shareFeedPost(postId: string): Promise<void> {
  await apiRequest("POST", `/api/feed/${postId}/share`);
}

export async function addFeedComment(postId: string, content: string): Promise<void> {
  await apiRequest("POST", `/api/feed/${postId}/comments`, { content });
}