import { app } from "./app.js";
import { config, phoneModeConfigured } from "./config.js";
import { demoMode } from "./demo.js";
import { attachMediaStreams } from "./phone/stream.js";
import { startTunnel } from "./phone/tunnel.js";

const server = app.listen(config.port, () => {
  console.log(`DuyAI: http://localhost:${config.port}`);
  if (!config.azure.key) console.warn("⚠  AZURE_SPEECH_KEY .env faylında yoxdur");
  if (!config.claude.hasKey) console.warn("⚠  ANTHROPIC_API_KEY .env faylında yoxdur");

  if (demoMode) console.log("🌐 Public demo mode: only free, rate-limited endpoints are open");
  if (phoneModeConfigured && !demoMode) {
    startTunnel(config.port).then(
      (url) => console.log(`📞 Telefon rejimi hazırdır: ${url}`),
      () => console.warn("⚠  Telefon rejimi işləməyəcək: tunel açılmadı"),
    );
  }
});

if (!demoMode) attachMediaStreams(server);
