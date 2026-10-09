import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { config, LANGUAGES } from "../config.js";
import { respond, translate } from "../services/claude.js";
import { alertBeepMulaw } from "./mulaw.js";
import { createCall, describeTwilioError, hangUp } from "./twilio.js";

const SILENCE_MS = 600; // pause that ends a phrase
const ECHO_MARGIN_MS = 300;
const CONTEXT_LINES = 6;
const CHUNK_BYTES = 3200; // 400 ms of 8 kHz μ-law per WebSocket message
const ALERT_BEEP_GAP_MS = 4000;
const KEEP_FINISHED_MS = 10 * 60 * 1000;

const SPEAKER_NAMES = { me: "Me", friend: "Friend", ai: "AI assistant (speaking for Me)" };
const FAILED_STATUSES = new Set(["busy", "no-answer", "failed", "canceled"]);

const sessions = new Map();

export const getSession = (id) => sessions.get(id);

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const toWire = (e) => ({
  speaker: SPEAKER_NAMES[e.who],
  time: e.time,
  original: e.original,
  translation: e.translation,
});

const speechConfig = () => sdk.SpeechConfig.fromSubscription(config.azure.key, config.azure.region);

/**
 * One phone-to-phone call: Twilio dials me, then the other party; both call legs stream
 * their audio here, and each recognized phrase is translated and spoken into the other leg.
 * Emits "event" objects that the browser receives over Server-Sent Events.
 */
export class PhoneSession extends EventEmitter {
  constructor({ myNumber, friendNumber, myLang, friendLang, voice, autoAnswer, profile }) {
    super();
    this.id = randomUUID();
    this.voice = voice;
    this.autoAnswer = autoAnswer;
    this.profile = profile;
    this.status = "idle";
    this.startedAt = null;
    this.transcript = [];
    this.nextId = 0;
    this.lastBeep = 0;
    this.ended = false;
    this.synthesizers = new Map();
    this.legs = {
      me: this.createLeg("me", myNumber, myLang),
      friend: this.createLeg("friend", friendNumber, friendLang),
    };
    sessions.set(this.id, this);
  }

  createLeg(name, number, lang) {
    return {
      name,
      number,
      lang,
      callSid: null,
      ws: null,
      streamSid: null,
      push: null,
      recognizer: null,
      playingUntil: 0,
      queue: Promise.resolve(),
    };
  }

  other(leg) {
    return leg.name === "me" ? this.legs.friend : this.legs.me;
  }

  send(type, data = {}) {
    this.emit("event", { type, ...data });
  }

  setStatus(status, extra = {}) {
    this.status = status;
    this.send("status", { status, startedAt: this.startedAt, ...extra });
  }

  /** State for a browser that (re)connects mid-call. */
  snapshot() {
    return { status: this.status, startedAt: this.startedAt, transcript: this.transcript };
  }

  updateOptions({ autoAnswer, profile }) {
    if (typeof autoAnswer === "boolean") this.autoAnswer = autoAnswer;
    if (typeof profile === "string") this.profile = profile;
  }

  // ---------- dialing ----------

  async dial(leg, baseUrl) {
    const query = `session=${this.id}&leg=${leg.name}`;
    try {
      const call = await createCall({
        to: leg.number,
        voiceUrl: `${baseUrl}/twilio/voice?${query}`,
        statusUrl: `${baseUrl}/twilio/status?${query}`,
      });
      leg.callSid = call.sid;
      console.log(`[phone] ${leg.name}: zəng edilir (${call.sid})`);
    } catch (err) {
      this.fail(describeTwilioError(err));
      throw err;
    }
  }

  /** Calls me first; the other party is dialed once I have answered. */
  async start(baseUrl) {
    this.baseUrl = baseUrl;
    this.setStatus("calling-me");
    await this.dial(this.legs.me, baseUrl);
  }

  /** Twilio status callback for one leg. */
  onCallStatus(legName, status) {
    const leg = this.legs[legName];
    if (!leg || this.ended) return;
    if (FAILED_STATUSES.has(status) && !leg.ws) {
      const who = legName === "me" ? "Siz" : "Qarşı tərəf";
      return this.fail(`${who} zəngə cavab vermədi (${status})`);
    }
    if (status === "completed") this.end();
  }

  fail(message) {
    console.warn("[phone] xəta:", message);
    this.send("error", { message });
    this.end();
  }

  // ---------- media streams ----------

  /** A Twilio media stream for one leg has started. */
  attachStream(legName, ws, streamSid) {
    const leg = this.legs[legName];
    if (!leg || this.ended) return ws.close();
    leg.ws = ws;
    leg.streamSid = streamSid;
    console.log(`[phone] ${legName}: səs axını başladı`);
    this.startRecognizer(leg);

    if (legName === "me") {
      this.setStatus("calling-friend");
      this.dial(this.legs.friend, this.baseUrl).catch(() => {});
    } else {
      this.startedAt = Date.now();
      this.setStatus("live");
      this.prewarm();
    }
  }

  onMedia(legName, payload) {
    const push = this.legs[legName]?.push;
    if (!push) return;
    const audio = Buffer.from(payload, "base64");
    push.write(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.length));
  }

  onStreamStop(legName) {
    const leg = this.legs[legName];
    if (leg?.ws) {
      leg.ws = null;
      this.end();
    }
  }

  startRecognizer(leg) {
    const format = sdk.AudioStreamFormat.getWaveFormat(8000, 8, 1, sdk.AudioFormatTag.MuLaw);
    leg.push = sdk.AudioInputStream.createPushStream(format);
    const cfg = speechConfig();
    cfg.speechRecognitionLanguage = LANGUAGES[leg.lang].locale;
    cfg.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, String(SILENCE_MS));
    leg.recognizer = new sdk.SpeechRecognizer(cfg, sdk.AudioConfig.fromStreamInput(leg.push));

    leg.recognizer.recognizing = (_s, e) =>
      this.send("partial", { who: leg.name, text: e.result.text });
    leg.recognizer.recognized = (_s, e) => {
      this.send("partial", { who: leg.name, text: "" });
      const text = e.result.text?.trim();
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech && text) {
        this.handlePhrase(leg, text, e.result.duration / 10_000);
      }
    };
    leg.recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        this.send("error", { message: `Səs tanıma xətası: ${e.errorDetails}` });
      }
    };
    leg.recognizer.startContinuousRecognitionAsync();
  }

  // ---------- speech out ----------

  synthesizer(lang) {
    const voice = LANGUAGES[lang].voices[this.voice];
    let synth = this.synthesizers.get(voice);
    if (!synth) {
      const cfg = speechConfig();
      cfg.speechSynthesisVoiceName = voice;
      cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw;
      synth = new sdk.SpeechSynthesizer(cfg, null); // null: return audio instead of playing it
      this.synthesizers.set(voice, synth);
    }
    return synth;
  }

  prewarm() {
    for (const leg of Object.values(this.legs)) {
      sdk.Connection.fromSynthesizer(this.synthesizer(leg.lang)).openConnection();
    }
  }

  synthesize(text, lang) {
    const synth = this.synthesizer(lang);
    return new Promise((resolve, reject) =>
      synth.speakTextAsync(
        text,
        (r) =>
          r.reason === sdk.ResultReason.SynthesizingAudioCompleted
            ? resolve(Buffer.from(r.audioData))
            : reject(new Error(r.errorDetails || "Səsləndirmə alınmadı")),
        (err) => reject(new Error(err)),
      ),
    );
  }

  /**
   * Streams μ-law audio into a call leg. Twilio plays it after anything already queued;
   * returns the delay (ms) until it starts playing and remembers when it ends (echo guard).
   */
  play(leg, audio) {
    if (!leg.ws || leg.ws.readyState !== leg.ws.OPEN) return 0;
    for (let i = 0; i < audio.length; i += CHUNK_BYTES) {
      leg.ws.send(
        JSON.stringify({
          event: "media",
          streamSid: leg.streamSid,
          media: { payload: audio.subarray(i, i + CHUNK_BYTES).toString("base64") },
        }),
      );
    }
    const now = Date.now();
    const startsAt = Math.max(now, leg.playingUntil);
    const durationMs = audio.length / 8; // 8000 bytes per second
    leg.playingUntil = startsAt + durationMs;
    this.send("playing", { to: leg.name, delayMs: startsAt - now, durationMs });
    return startsAt - now;
  }

  // ---------- translation pipeline ----------

  addEntry(entry) {
    this.transcript.push(entry);
    this.send("entry", { entry });
    return entry;
  }

  updateEntry(entry, patch) {
    Object.assign(entry, patch);
    this.send("entry", { entry });
  }

  raiseAlert(entry) {
    this.send("alert", {
      alert: {
        ...entry.risk,
        id: entry.id,
        entryId: entry.id,
        time: entry.time,
        quote: entry.original,
      },
    });
    if (Date.now() - this.lastBeep > ALERT_BEEP_GAP_MS) {
      this.lastBeep = Date.now();
      this.play(this.legs.me, alertBeepMulaw());
    }
  }

  handlePhrase(leg, text, durationMs) {
    const heardAt = Date.now();
    // Echo guard: ignore speech that overlapped AI audio we were playing into this leg.
    if (leg.playingUntil > heardAt - durationMs - SILENCE_MS - ECHO_MARGIN_MS) return;

    const other = this.other(leg);
    const context = this.transcript.slice(-CONTEXT_LINES).map(toWire);
    const entry = this.addEntry({
      id: this.nextId++,
      who: leg.name,
      time: clock(heardAt - (this.startedAt ?? heardAt)),
      original: text,
      translation: "",
      toLang: other.lang,
      status: "pending",
    });

    // One queue per leg keeps that speaker's phrases in order.
    leg.queue = leg.queue.then(() => this.processPhrase(leg, other, entry, context, heardAt));
  }

  async processPhrase(leg, other, entry, context, heardAt) {
    const isFriend = leg.name === "friend";
    const allowReply = isFriend && this.autoAnswer;
    try {
      const result = isFriend
        ? await respond({
            text: entry.original,
            from: leg.lang,
            to: other.lang,
            context,
            profile: this.profile,
            allowReply,
          })
        : {
            translation: await translate({
              text: entry.original,
              from: leg.lang,
              to: other.lang,
              context,
            }),
          };

      const risky = Boolean(result.risk && result.risk.level !== "none");
      this.updateEntry(entry, {
        translation: result.translation,
        status: "done",
        note: result.needs_user ? result.note : undefined,
        risk: risky ? result.risk : undefined,
      });
      if (risky) this.raiseAlert(entry);

      const reply = allowReply && !risky ? (result.reply ?? "").trim() : "";
      const [audio, replyAudio] = await Promise.all([
        this.synthesize(result.translation, other.lang),
        reply ? this.synthesize(reply, leg.lang) : null,
      ]);

      const delay = this.play(other, audio);
      this.updateEntry(entry, { latencyMs: Date.now() + delay - heardAt });

      if (replyAudio) {
        const replyEntry = this.addEntry({
          id: this.nextId++,
          who: "ai",
          time: clock(Date.now() - this.startedAt),
          original: reply,
          translation: result.reply_translation,
          toLang: other.lang,
          status: "done",
        });
        const replyDelay = this.play(leg, replyAudio);
        this.updateEntry(replyEntry, { latencyMs: Date.now() + replyDelay - heardAt });
      }
    } catch (err) {
      console.error("[phone]", err);
      this.updateEntry(entry, { status: "error", error: err?.message ?? String(err) });
    }
  }

  // ---------- teardown ----------

  async end() {
    if (this.ended) return;
    this.ended = true;
    const duration = clock(this.startedAt ? Date.now() - this.startedAt : 0);

    for (const leg of Object.values(this.legs)) {
      if (leg.callSid) hangUp(leg.callSid);
      leg.push?.close();
      leg.recognizer?.stopContinuousRecognitionAsync(
        () => leg.recognizer.close(),
        () => leg.recognizer.close(),
      );
      leg.ws?.close();
    }
    for (const synth of this.synthesizers.values()) synth.close();

    console.log(`[phone] zəng bitdi (${duration})`);
    this.setStatus("ended", { duration });
    setTimeout(() => sessions.delete(this.id), KEEP_FINISHED_MS).unref();
  }
}
