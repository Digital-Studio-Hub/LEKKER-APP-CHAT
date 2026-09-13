/**
 * Map incoming system / universal links into Expo Router paths.
 * Website Lekker Chat FAB → https://chat.lekker.network/o/:workspaceId
 * Custom scheme → lekkerchat://open-business/:workspaceId
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const raw = String(path || "");
    // Strip scheme://host if present
    let pathname = raw;
    const schemeIdx = raw.indexOf("://");
    if (schemeIdx >= 0) {
      const after = raw.slice(schemeIdx + 3);
      const slash = after.indexOf("/");
      pathname = slash >= 0 ? after.slice(slash) : after;
    }
    pathname = pathname.split("?")[0].split("#")[0];

    const openBiz =
      pathname.match(/^\/?o\/([^/]+)\/?$/i) ||
      pathname.match(/^\/?open-business\/([^/]+)\/?$/i);
    if (openBiz?.[1]) {
      return `/open-business/${encodeURIComponent(openBiz[1])}`;
    }
  } catch {
    /* fall through */
  }
  return "/";
}
