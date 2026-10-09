import { WebSocketServer } from "ws";
import { getSession } from "./session.js";

/**
 * Twilio Media Streams endpoint: each call leg opens a WebSocket here and sends
 * "start" (with our session/leg parameters), then base64 μ-law "media" frames, then "stop".
 * https://www.twilio.com/docs/voice/media-streams/websocket-messages
 */
export function attachMediaStreams(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/twilio/stream" });

  wss.on("connection", (ws) => {
    let session = null;
    let leg = null;

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      switch (message.event) {
        case "start": {
          const params = message.start?.customParameters ?? {};
          session = getSession(params.session) ?? null;
          leg = params.leg === "me" || params.leg === "friend" ? params.leg : null;
          if (!session || !leg) return ws.close();
          session.attachStream(leg, ws, message.start.streamSid);
          break;
        }
        case "media":
          if (message.media?.track !== "outbound") session?.onMedia(leg, message.media?.payload);
          break;
        case "stop":
          session?.onStreamStop(leg);
          break;
      }
    });

    ws.on("close", () => session?.onStreamStop(leg));
  });
}
