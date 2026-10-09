import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { Router } from "express";
import QRCode from "qrcode";
import { config } from "./config.js";

/**
 * Phone viewer: a read-only live page for the user's phone on the same Wi-Fi. The PC app
 * pushes snapshots of the call; phones receive them over Server-Sent Events. Access needs
 * a random token (new on every server start, shared via QR code) and a private-network
 * address, so the page is never reachable through the public tunnel.
 */

const TOKEN = randomBytes(16).toString("hex");
const HEARTBEAT_MS = 20_000;
const MAX_SNAPSHOT_BYTES = 200_000;

const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL_ADAPTER =
  /virtual|vmware|vbox|hyper-v|vethernet|loopback|wsl|docker|tailscale|zerotier/i;

/** Private IPv4 addresses of this PC, real (Wi-Fi/Ethernet) adapters first. */
export function lanAddresses() {
  const found = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && PRIVATE_V4.test(a.address)) {
        found.push({ name, address: a.address, rank: adapterRank(name, a.address) });
      }
    }
  }
  return found.sort((a, b) => a.rank - b.rank);
}

/** Lower is better: Wi-Fi first (phones use it), then Ethernet, virtual adapters last. */
function adapterRank(name, address) {
  // 192.168.56.x is VirtualBox's host-only network, often named just "Ethernet 2".
  if (VIRTUAL_ADAPTER.test(name) || address.startsWith("192.168.56.")) return 3;
  if (/wi-?fi|wlan|wireless|kablosuz/i.test(name)) return 0;
  if (/ethernet|lan/i.test(name)) return 1;
  return 2;
}

const isLocalHost = (host) => ["localhost", "127.0.0.1", "::1"].includes(host);
const isPrivateHost = (host) => isLocalHost(host) || PRIVATE_V4.test(host);

function validToken(value) {
  if (typeof value !== "string" || value.length !== TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(TOKEN));
}

/** Lets viewer requests from the local network through the "local only" gate. */
export function isViewerRequest(req) {
  return (
    (req.path === "/viewer.html" || req.path === "/viewer/stream") &&
    isPrivateHost(req.hostname) &&
    validToken(req.query.t)
  );
}

let snapshot = { status: "idle", entries: [], partials: { me: "", friend: "" }, alerts: [] };
const clients = new Set();

function broadcast() {
  const message = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of clients) res.write(message);
}

/** Local API used by the PC app. */
export const viewerApi = Router();

viewerApi.get("/link", async (_req, res) => {
  const addresses = lanAddresses();
  if (!addresses.length) {
    return res.status(503).json({ error: "Kompüter heç bir Wi-Fi/lokal şəbəkəyə qoşulmayıb" });
  }
  const urls = addresses.map((a) => ({
    adapter: a.name,
    url: `http://${a.address}:${config.port}/viewer.html?t=${TOKEN}`,
  }));
  const qr = await QRCode.toString(urls[0].url, { type: "svg", margin: 1, width: 240 });
  res.json({ url: urls[0].url, qr, alternatives: urls.slice(1), viewers: clients.size });
});

viewerApi.post("/snapshot", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || JSON.stringify(body).length > MAX_SNAPSHOT_BYTES) {
    return res.status(400).json({ error: "invalid snapshot" });
  }
  snapshot = body;
  broadcast();
  res.status(204).end();
});

/** The phone's live stream (token-protected, see isViewerRequest). */
export function viewerStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  clients.add(res);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

/**
 * Public demo: there is no local network to mirror a call over, so the QR code simply opens
 * the demo itself on the visitor's phone.
 */
export async function demoQr(req, res) {
  const url = `https://${req.get("host")}/`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 240 });
  res.json({ url, qr, alternatives: [], viewers: 0, demo: true });
}
