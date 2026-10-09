/**
 * Public demo mode (PUBLIC_DEMO=1, e.g. on Vercel). The app is reachable from the
 * internet, so only the endpoints the demo needs are open, each rate-limited per visitor.
 * Claude features (report, live insights) have a daily cap so the public link cannot drain
 * the team's credit; call memory, the phone viewer and phone mode stay off.
 */

export const demoMode = process.env.PUBLIC_DEMO === "1";

/** Endpoints a public visitor may call, with requests allowed per IP per minute. */
const OPEN_ENDPOINTS = {
  "/api/health": 30,
  "/api/speech-token": 12,
  "/api/translate": 60,
  "/api/respond": 60,
  "/api/diagnostics": 120,
  "/api/call-state": 30,
  "/api/summary": 3,
  "/api/insights": 12,
};
/** Claude requests allowed per day for the whole public demo. */
const DAILY_CLAUDE = { "/api/summary": 40, "/api/insights": 300, "/api/respond": 400 };
/** Protects the free Translator quota (2M characters / month). */
const DAILY_TRANSLATE_CHARS = 60_000;

const hits = new Map();
let day = "";
let translatedToday = 0;
const claudeToday = {};

function overLimit(ip, path, perMinute) {
  const key = `${ip} ${path}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // memory guard
  return recent.length > perMinute;
}

function newDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today === day) return;
  day = today;
  translatedToday = 0;
  for (const key of Object.keys(claudeToday)) delete claudeToday[key];
}

function overClaudeQuota(path) {
  newDay();
  claudeToday[path] = (claudeToday[path] ?? 0) + 1;
  return claudeToday[path] > DAILY_CLAUDE[path];
}

function overDailyQuota(req) {
  newDay();
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  translatedToday += text.length;
  return translatedToday > DAILY_TRANSLATE_CHARS;
}

/** Express middleware for /api in demo mode (mounted after express.json). */
export function demoGuard(req, res, next) {
  const path = req.baseUrl + req.path;
  const perMinute = OPEN_ENDPOINTS[path];
  if (!perMinute) return res.status(404).json({ error: "Demo versiyada mövcud deyil" });
  if (overLimit(req.ip, path, perMinute)) {
    return res.status(429).json({ error: "Çox sürətli: bir az gözləyib yenidən cəhd edin" });
  }
  if (DAILY_CLAUDE[path] && overClaudeQuota(path)) {
    return res.status(429).json({ error: "Bugünkü demo AI limiti doldu" });
  }
  if ((path === "/api/translate" || path === "/api/respond") && overDailyQuota(req)) {
    return res.status(429).json({ error: "Bugünkü demo limiti doldu" });
  }
  next();
}
