import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { phoneApi, twilioWebhooks } from "./phone/routes.js";
import { api } from "./routes.js";
import { demoGuard, demoMode } from "./demo.js";
import { demoQr, isViewerRequest, viewerApi, viewerStream } from "./viewer.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** The Express app (also the Vercel serverless handler, see api/index.js). */
export const app = express();

// The tunnel makes this server reachable from the internet for Twilio. Everything except
// the signed Twilio webhooks stays local, so nobody else can use the paid AI APIs. The
// phone viewer is the one exception on the local network (token-protected, read-only).
// In public demo mode (cloud) the site is open to everyone, but only the free,
// rate-limited endpoints listed in demo.js are reachable.
if (demoMode) {
  app.set("trust proxy", 1); // client IPs for rate limiting come via the cloud proxy
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/viewer/link", demoQr);
  app.use("/api", demoGuard, api);
} else {
  app.use((req, res, next) => {
    if (LOCAL_HOSTS.has(req.hostname) || req.path.startsWith("/twilio/")) return next();
    if (isViewerRequest(req)) return next();
    res.status(404).end();
  });

  app.use("/twilio", twilioWebhooks);
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/phone", phoneApi);
  app.use("/api/viewer", viewerApi);
  app.use("/api", api);
  app.get("/viewer/stream", viewerStream);
}

// Serve the built React app (npm run build). In development Vite serves it instead.
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|twilio|viewer)\/).*/, (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
