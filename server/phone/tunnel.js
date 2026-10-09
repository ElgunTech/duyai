import { existsSync } from "node:fs";
import { Tunnel, bin, install } from "cloudflared";
import { config } from "../config.js";

let publicUrl = config.twilio.publicUrl || null;
let starting = null;

/**
 * Twilio must reach this server from the internet. Unless PUBLIC_URL is set, a free
 * temporary Cloudflare tunnel (https://*.trycloudflare.com) is opened at startup.
 */
export function startTunnel(port) {
  if (publicUrl || starting) return starting ?? Promise.resolve(publicUrl);

  starting = (async () => {
    if (!existsSync(bin)) {
      console.log("☁  cloudflared yüklənir (bir dəfəlik)...");
      await install(bin);
    }
    const tunnel = Tunnel.quick(`http://localhost:${port}`);
    const url = await new Promise((resolve, reject) => {
      tunnel.once("url", resolve);
      tunnel.once("error", reject);
      tunnel.once("exit", (code) => reject(new Error(`cloudflared exited (${code})`)));
    });
    publicUrl = url.replace(/\/$/, "");
    process.once("exit", () => tunnel.stop());
    return publicUrl;
  })();

  starting.catch((err) => {
    console.error("☁  Tunel açılmadı:", err.message);
    starting = null;
  });
  return starting;
}

/** The public https URL of this server, or null while the tunnel is starting. */
export const getPublicUrl = () => publicUrl;
