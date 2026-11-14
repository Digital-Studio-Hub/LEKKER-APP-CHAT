import type { NextFunction, Request, Response } from "express";

/**
 * One legal set: https://lekker.network/terms and https://lekker.network/privacy
 * are the only Terms & Conditions and Privacy Policy for every Keen Ideas (Pty) Ltd
 * brand. This property's own legal URLs permanently redirect (301) there.
 */
export const LEGAL_TERMS_URL = "https://lekker.network/terms";
export const LEGAL_PRIVACY_URL = "https://lekker.network/privacy";

export const LEGAL_REDIRECTS: Record<string, string> = {
  "/terms": LEGAL_TERMS_URL,
  "/terms-and-conditions": LEGAL_TERMS_URL,
  "/privacy": LEGAL_PRIVACY_URL,
  "/privacy-policy": LEGAL_PRIVACY_URL,
};

/** Target for a request path, or null. Ignores case and one trailing slash. */
export function legalRedirectTarget(path: string): string | null {
  const normalised = path.length > 1 ? path.replace(/\/+$/, "").toLowerCase() : path.toLowerCase();
  return LEGAL_REDIRECTS[normalised] ?? null;
}

type Options = {
  /** Only redirect when this returns true for the request host (default: every host). */
  hostAllowed?: (host: string) => boolean;
};

export function legalRedirects(options: Options = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const target = legalRedirectTarget(req.path);
    if (!target) return next();
    if (options.hostAllowed) {
      const host = String(req.get("x-forwarded-host") || req.get("host") || "")
        .split(",")[0]
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, "");
      if (!options.hostAllowed(host)) return next();
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(301, target);
  };
}
