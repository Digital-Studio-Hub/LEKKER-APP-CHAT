/**
 * Upload a photo from Lekker Chat into Network Drive /website-assets
 * so Cledwyn Web can pass driveFileIds into open_edit_website.
 */
import { getApiUrl } from "@/lib/query-client";
import { getAuthToken } from "@/lib/auth-token";

export type ChatWebsiteAsset = {
  id: number;
  name: string;
  shareUrl: string;
  mimeType: string | null;
};

export async function uploadChatImageToWebsiteAssets(opts: {
  uri: string;
  fileName?: string;
  mimeType?: string;
}): Promise<ChatWebsiteAsset> {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in required");
  const base = getApiUrl();
  const name = opts.fileName || `chat-${Date.now()}.jpg`;
  const type = opts.mimeType || "image/jpeg";

  const form = new FormData();
  form.append("folder", "/website-assets");
  form.append("files", {
    uri: opts.uri,
    name,
    type,
  } as any);

  const uploadRes = await fetch(`${base}api/drive/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed (${uploadRes.status})`);
  }
  const records = await uploadRes.json();
  const record = Array.isArray(records) ? records[0] : records;
  if (!record?.id) throw new Error("Upload returned no file id");

  const shareRes = await fetch(`${base}api/drive/${record.id}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!shareRes.ok) throw new Error("Could not create share link");
  const share = await shareRes.json();
  const shareToken = share.shareToken || record.shareToken;
  if (!shareToken) throw new Error("No share token");

  const origin = base.replace(/\/$/, "").replace(/\/api\/?$/, "") || "https://lekker.network";
  const shareUrl = `${origin}/api/drive/shared/${shareToken}`;

  return {
    id: Number(record.id),
    name: String(record.name || name),
    shareUrl,
    mimeType: record.mimeType || type,
  };
}

export function websiteAssetsHint(assets: ChatWebsiteAsset[]): string {
  if (!assets.length) return "";
  const ids = assets.map((a) => a.id).join(",");
  const urls = assets.map((a) => a.shareUrl).join("|");
  return (
    `[WEBSITE ASSETS: driveFileIds=[${ids}] assetUrls=[${urls}] — pass these to open_edit_website / open_build_website so photos land in site assets/]\n` +
    assets.map((a) => `${a.name}: ${a.shareUrl}`).join("\n")
  );
}
