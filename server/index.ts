import express from "express";
import compression from "compression";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";

process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception (server will continue):", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection (server will continue):", reason);
});

const app = express();
const log = console.log;

// Chat payloads must never be cached — 304/empty bodies made the app wipe message threads.
app.set("etag", false);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  next();
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      const queryStr = Object.keys(req.query).length > 0 ? `?${new URLSearchParams(req.query as Record<string, string>).toString()}` : "";
      let logLine = `${req.method} ${path}${queryStr} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
  businessName,
  workspaceId,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
  businessName?: string | null;
  workspaceId?: string | null;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const deepLink = workspaceId
    ? `lekkerchat://open-business/${encodeURIComponent(workspaceId)}`
    : "";
  const headline = businessName
    ? `Chat with <span>${escapeHtml(businessName)}</span>`
    : `Lekker <span>Chat</span>`;
  const lead = businessName
    ? `Open the Lekker Chat app to message this business. If you don’t have it yet, download below — we’ll take you straight there after you sign in.`
    : `WhatsApp-style messaging for Lekkerpreneurs — find nearby businesses, Instant Match, enquire, and grow together on Lekker Network.`;

  let html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName)
    .replace(/<h1>Lekker <span>Chat<\/span><\/h1>/, `<h1>${headline}</h1>`)
    .replace(
      /WhatsApp-style messaging for Lekkerpreneurs — find nearby businesses,\s*Instant Match, enquire, and grow together on Lekker Network\./,
      lead,
    );

  if (deepLink) {
    const openBtn = `
      <a class="store-btn apple" href="${deepLink}" style="margin-bottom:12px;background:var(--yellow);color:var(--bg)">
        <span class="label"><small>Already have the app?</small><span>Open in Lekker Chat</span></span>
      </a>`;
    html = html.replace('<div class="stores">', `<div class="stores">${openBtn}`);
    html = html.replace(
      "</body>",
      `<script>(function(){try{var u=${JSON.stringify(deepLink)};setTimeout(function(){window.location.href=u;},400);}catch(e){}})();</script></body>`,
    );
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    const openMatch = req.path.match(/^\/o\/([^/]+)\/?$/);
    if (openMatch) {
      const workspaceId = decodeURIComponent(openMatch[1]);
      // Best-effort business name for landing copy (non-blocking if Network down)
      import("./lekkerNetwork")
        .then(({ fetchWorkspaceById, isLekkerNetworkConfigured }) => {
          if (!isLekkerNetworkConfigured()) {
            return serveLandingPage({
              req,
              res,
              landingPageTemplate,
              appName,
              workspaceId,
              businessName: null,
            });
          }
          return fetchWorkspaceById(workspaceId).then((ws) => {
            const businessName =
              ws?.businessName || ws?.tradingName || ws?.workspaceName || null;
            return serveLandingPage({
              req,
              res,
              landingPageTemplate,
              appName,
              workspaceId,
              businessName,
            });
          });
        })
        .catch(() =>
          serveLandingPage({
            req,
            res,
            landingPageTemplate,
            appName,
            workspaceId,
            businessName: null,
          }),
        );
      return;
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  app.use(compression());
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  // Cloud Run sets K_SERVICE; Replit sets REPLIT_*; local macOS needs 127.0.0.1.
  const onCloud =
    !!(process.env.K_SERVICE || process.env.REPLIT_DEV_DOMAIN || process.env.REPL_ID) ||
    process.env.LISTEN_HOST === "0.0.0.0";
  server.listen(
    {
      port,
      host: onCloud ? "0.0.0.0" : "127.0.0.1",
      ...(process.env.REPLIT_DEV_DOMAIN || process.env.REPL_ID ? { reusePort: true } : {}),
    },
    () => {
      log(`express server serving on port ${port}`);
      // Chat SSE bus — LISTEN lekker_chat (direct Neon URL; not the pooler).
      void import("./realtime")
        .then(({ startRealtimeListener }) => startRealtimeListener())
        .catch((e) => console.error("[Realtime] boot LISTEN failed:", e?.message || e));
      // Additive schema (Publish ≠ migrate)
      void import("./storage").then(async ({ pool }) => {
        try {
          await pool.query(`
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auto_reply_cooldown_minutes integer DEFAULT 5;
          `);
          log("[BootMigration] OK: users.auto_reply_cooldown_minutes");
        } catch (e: any) {
          console.error("[BootMigration] auto_reply_cooldown_minutes failed:", e?.message || e);
        }
      });
      // Companion check-ins + family silence alerts. Cloud Scheduler is preferred;
      // this in-process loop covers prod when Scheduler is missing/unconfigured.
      if (process.env.NODE_ENV === "production" || process.env.COMPANION_CRON_INLINE === "1") {
        const intervalMs = Math.max(
          5 * 60 * 1000,
          Number(process.env.COMPANION_CRON_INTERVAL_MS || 15 * 60 * 1000),
        );
        const tick = async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const { runCompanionCron } = await import("./personal-care");
              const result = await runCompanionCron();
              if (result.checkIns || result.familyAlerts) {
                log(`[CompanionCron] inline checked=${result.checked} checkIns=${result.checkIns} familyAlerts=${result.familyAlerts}`);
              }
              try {
                const { pushUnreadNetworkNotifications } = await import("./lekkerNetwork");
                const n = await pushUnreadNetworkNotifications();
                if (n.pushed) {
                  log(`[NetworkNotifPush] users=${n.users} pushed=${n.pushed}`);
                }
              } catch (e: any) {
                console.warn("[NetworkNotifPush] tick failed:", e?.message || e);
              }
              return;
            } catch (e: any) {
              console.error(`[CompanionCron] inline tick failed (attempt ${attempt}):`, e?.message || e);
              if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
        };
        setTimeout(() => {
          void tick();
        }, 30_000);
        setInterval(() => {
          void tick();
        }, intervalMs);
        log(`[CompanionCron] inline scheduler every ${Math.round(intervalMs / 60000)}m`);
      }
    },
  );
})();
