import { config } from "../config.js";
import { withNetworkRetry } from "./retry.js";

const TOKEN_TIMEOUT_MS = 6000;

/**
 * Exchanges the Azure Speech key for a 10-minute authorization token,
 * so the key itself never reaches the browser.
 */
export async function issueSpeechToken() {
  const { key, region } = config.azure;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION .env faylında yoxdur");
  }
  const res = await withNetworkRetry(() =>
    fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    }),
  );
  if (!res.ok) throw new Error(`Azure açarı qəbul olunmadı (HTTP ${res.status})`);
  return res.text();
}
