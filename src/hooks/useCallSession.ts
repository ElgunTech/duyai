import { useCallback, useEffect, useRef, useState } from "react";
import { ECHO_MARGIN_MS, SILENCE_MS, TRANSLATION_CONTEXT } from "../config/constants";
import type { LanguageCode } from "../config/languages";
import type { Notify } from "../context/toastContext";
import { api } from "../lib/api";
import {
  ClipPlayer,
  StreamAnalyser,
  audioContext,
  createAlertTone,
  openInputStream,
  playClip,
  routeToDevice,
  stopStream,
} from "../lib/audio";
import { findPhoneCallInput, isPlaybackCapture, type AudioDevice } from "../lib/devices";
import { logDiagnostic } from "../lib/diagnostics";
import { formatClock } from "../lib/format";
import { detectScam, isRisky, moreSevere } from "../lib/scam";
import { SpeechService } from "../lib/speech";
import type {
  AutoResponse,
  CallStatus,
  DeviceSelection,
  RiskAssessment,
  ScamAlert,
  Side,
  TranscriptEntry,
  VoiceGender,
} from "../types";
import { tr } from "../i18n/i18n";

export interface CallSettings {
  myLang: LanguageCode;
  friendLang: LanguageCode;
  voice: VoiceGender;
  devices: DeviceSelection;
  /** Play the other side's original voice quietly in my headphones. */
  monitorOriginal: boolean;
  /**
   * Started automatically while the phone is still ringing: hold back my speech until the
   * other party says something, so they don't hear what I said before they picked up.
   */
  waitForAnswer?: boolean;
}

export interface FinishedCall {
  transcript: TranscriptEntry[];
  duration: string;
  /** The other party's language as finally detected during the call. */
  friendLang?: LanguageCode;
  /** Epoch ms when the call started (anchors "tomorrow" etc. in the report). */
  startedAt?: number;
}

interface Media {
  analysers: Record<Side, StreamAnalyser>;
  /** `toMe` speaks into my headphones, `toFriend` into the call. */
  players: { toMe: ClipPlayer; toFriend: ClipPlayer };
}

/** Anything that can tell whether AI audio was playing recently. */
interface EchoSource {
  wasActiveSince(since: number): boolean;
}

const anyActive = (...sources: EchoSource[]): EchoSource => ({
  wasActiveSince: (since) => sources.some((s) => s.wasActiveSince(since)),
});

interface Direction {
  who: Side;
  /** Language to translate into, read per phrase (the other party's may be re-detected). */
  target: () => LanguageCode;
  /** Where the translation is spoken. */
  player: ClipPlayer;
  /** AI audio that could leak back into this side's input (echo guard). */
  echoSource: EchoSource;
  /** Only for the other party's speech: scam screening and auto-answer. */
  screening?: {
    /** Where a reply on my behalf is spoken. */
    replyPlayer: ClipPlayer;
    /** Where the scam warning beep is played (my headphones). */
    alertDevice: string;
  };
}

/** Minimum gap between two warning beeps, so a scam monologue doesn't beep non-stop. */
const ALERT_BEEP_GAP_MS = 4000;

/** Options that may change during a call; read at the moment each phrase arrives. */
export interface LiveOptions {
  echoGuard: boolean;
  /** Let the AI answer the other party's questions on my behalf. */
  autoAnswer: boolean;
  /** Facts the AI may use when answering (name, dates, purpose of the call...). */
  profile: string;
}

const NO_REPLY: AutoResponse = {
  translation: "",
  reply: "",
  reply_translation: "",
  needs_user: false,
  note: "",
  risk: { level: "none", category: "none", reason: "" },
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** How long to wait for the phone's Bluetooth audio device to appear after a call starts. */
const PHONE_INPUT_WAIT_MS = 1500;

async function listAudioDevices(): Promise<AudioDevice[]> {
  return (await navigator.mediaDevices.enumerateDevices()).map(({ deviceId, kind, label }) => ({
    deviceId,
    kind,
    label,
  }));
}

/** While reading the cable, how often to check whether the phone's call device appeared. */
const PHONE_INPUT_POLL_MS = 2000;

/**
 * The other party's voice as one stable stream the recognizer keeps reading while the
 * device behind it changes. Preferred source: the phone's Bluetooth call device, which
 * Windows creates only while a call is active and the browser often sees only seconds
 * after the call starts. Until then the virtual cable selected in the panel is used, and
 * the stream switches to the phone as soon as it appears.
 */
class CallAudio {
  readonly stream: MediaStream;
  /** Label of the device currently feeding the stream. */
  label = "";
  private readonly output: MediaStreamAudioDestinationNode;
  private source: { stream: MediaStream; node: MediaStreamAudioSourceNode } | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;
  private switching = false;
  private disposed = false;

  constructor(private readonly notify: Notify) {
    this.output = audioContext().createMediaStreamDestination();
    this.stream = this.output.stream;
  }

  async open(cableDeviceId: string): Promise<void> {
    const deadline = Date.now() + PHONE_INPUT_WAIT_MS;
    let devices = await listAudioDevices();
    let phone = findPhoneCallInput(devices);
    while (!phone && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      devices = await listAudioDevices();
      phone = findPhoneCallInput(devices);
    }
    logDiagnostic("call-audio:devices", {
      inputs: devices.filter((d) => d.kind === "audioinput").map((d) => d.label),
      phoneInput: phone?.label ?? null,
    });
    if (phone && (await this.usePhone(phone))) return;

    const cable = devices.find((d) => d.deviceId === cableDeviceId)?.label ?? cableDeviceId;
    this.connect(await openInputStream(cableDeviceId, true));
    this.label = cable;
    logDiagnostic("call-audio:source", { source: "cable", label: cable });
    this.poll = setInterval(() => void this.checkForPhone(), PHONE_INPUT_POLL_MS);
  }

  private async checkForPhone(): Promise<void> {
    if (this.switching || this.disposed) return;
    this.switching = true;
    try {
      const phone = findPhoneCallInput(await listAudioDevices());
      if (phone && (await this.usePhone(phone))) clearInterval(this.poll);
    } finally {
      this.switching = false;
    }
  }

  private async usePhone(phone: AudioDevice): Promise<boolean> {
    try {
      const stream = await openInputStream(phone.deviceId, true);
      if (this.disposed) {
        stopStream(stream);
        return true;
      }
      this.connect(stream);
      this.label = phone.label;
      this.notify(
        tr(
          "Qarşı tərəfin səsi birbaşa telefondan (Bluetooth) alınır",
          "The other party's audio now comes straight from the phone (Bluetooth)",
        ),
        "success",
      );
      logDiagnostic("call-audio:source", { source: "phone", label: phone.label });
      return true;
    } catch (err) {
      logDiagnostic("call-audio:phone-failed", { error: errorMessage(err) });
      return false;
    }
  }

  /** Replaces the current device (the cable is dropped so the voice is never doubled). */
  private connect(stream: MediaStream): void {
    this.release();
    const node = audioContext().createMediaStreamSource(stream);
    node.connect(this.output);
    this.source = { stream, node };
  }

  private release(): void {
    this.source?.node.disconnect();
    stopStream(this.source?.stream);
    this.source = null;
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.poll);
    this.release();
    stopStream(this.stream);
  }
}

/**
 * Runs one translated call: two recognizers (my mic, the call audio), each feeding
 * translate → synthesize → play on the opposite side. In auto-answer mode the other
 * party's questions can also be answered by the AI. Exposes live state for the UI.
 */
export function useCallSession(notify: Notify, liveOptions: LiveOptions) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [partials, setPartials] = useState<Record<Side, string>>({ me: "", friend: "" });
  const [media, setMedia] = useState<Media | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<ScamAlert[]>([]);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  /** My microphone muted, like the mute button on a phone: nothing I say is sent. */
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const awaitingAnswerRef = useRef(false);
  /** The other party's language: starts as the chosen one, follows what Azure detects. */
  const [activeFriendLang, setActiveFriendLang] = useState<LanguageCode | null>(null);
  const friendLangRef = useRef<LanguageCode | null>(null);

  // Mutable call resources, not part of rendering.
  const lastBeepRef = useRef(0);
  const speechRef = useRef<SpeechService | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const monitorRef = useRef<HTMLAudioElement | null>(null);
  const mediaRef = useRef<Media | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const nextIdRef = useRef(0);
  const optionsRef = useRef(liveOptions);
  /** When the other party's words were last being recognized (bleed guard). */
  const friendHeardAtRef = useRef(0);
  const diagTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const callAudioRef = useRef<CallAudio | null>(null);
  /** Feeds a typed phrase in as the other party's speech (public demo). */
  const simulateRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    optionsRef.current = liveOptions;
  }, [liveOptions]);

  const commit = useCallback((entries: TranscriptEntry[]) => {
    transcriptRef.current = entries;
    setTranscript(entries);
  }, []);

  const patchEntry = useCallback(
    (id: number, patch: Partial<TranscriptEntry>) =>
      commit(transcriptRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    [commit],
  );

  /**
   * Marks an utterance as risky and shows (or escalates) its alert banner.
   * Called twice per utterance at most: by the instant keyword check and by the AI.
   */
  const raiseAlert = useCallback(
    (entry: TranscriptEntry, risk: RiskAssessment, alertDevice: string) => {
      const merged = moreSevere(entry.risk, risk);
      if (!merged || !isRisky(merged)) return;
      patchEntry(entry.id, { risk: merged });
      setAlerts((list) => {
        const existing = list.find((a) => a.entryId === entry.id);
        if (existing) return list.map((a) => (a === existing ? { ...a, ...merged } : a));
        return [
          ...list,
          { ...merged, id: entry.id, entryId: entry.id, time: entry.time, quote: entry.original },
        ];
      });
      if (Date.now() - lastBeepRef.current > ALERT_BEEP_GAP_MS) {
        lastBeepRef.current = Date.now();
        playClip(createAlertTone(), alertDevice, "audio/wav").catch(() => {});
      }
    },
    [patchEntry],
  );

  /** "We are already talking": stop holding back my speech. */
  const markAnswered = useCallback(() => {
    awaitingAnswerRef.current = false;
    setAwaitingAnswer(false);
  }, []);

  /** Mutes or unmutes my microphone (the recognizer then hears silence). */
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamsRef.current[0]?.getAudioTracks().forEach((track) => (track.enabled = !next));
    logDiagnostic("mic:mute", { muted: next });
  }, []);

  const dismissAlert = useCallback(
    (id: number) => setAlerts((list) => list.filter((a) => a.id !== id)),
    [],
  );

  const teardown = useCallback(async () => {
    clearInterval(diagTimerRef.current);
    await speechRef.current?.dispose();
    speechRef.current = null;
    callAudioRef.current?.dispose();
    callAudioRef.current = null;
    simulateRef.current = null;
    streamsRef.current.forEach(stopStream);
    streamsRef.current = [];
    if (monitorRef.current) {
      monitorRef.current.pause();
      monitorRef.current.srcObject = null;
      monitorRef.current = null;
    }
    mediaRef.current?.analysers.me.dispose();
    mediaRef.current?.analysers.friend.dispose();
    mediaRef.current = null;
    setMedia(null);
    setPartials({ me: "", friend: "" });
    mutedRef.current = false;
    setMuted(false);
  }, []);

  // Release microphones and recognizers if the component unmounts mid-call.
  useEffect(() => () => void teardown(), [teardown]);

  /** Builds the handler for finished phrases of one direction. */
  const createPhraseHandler = useCallback(
    (speech: SpeechService, callStart: number, voice: VoiceGender, dir: Direction) => {
      let queue = Promise.resolve();

      return (text: string, durationMs: number, spokenLang: LanguageCode) => {
        const heardAt = Date.now();
        const spokenFrom = heardAt - durationMs - SILENCE_MS - ECHO_MARGIN_MS;
        const options = optionsRef.current;
        const drop = (reason: string) =>
          logDiagnostic("phrase:dropped", { who: dir.who, reason, text: text.slice(0, 60) });
        if (dir.who === "me" && mutedRef.current) return drop("muted");
        if (options.echoGuard && dir.echoSource.wasActiveSince(spokenFrom)) {
          return drop("echo: AI voice was playing on this line");
        }
        // Bleed guard: the other party's voice coming out of my speakers into my mic.
        // While their words are being recognized, a "phrase" on my mic is them, not me.
        if (dir.who === "me" && friendHeardAtRef.current > spokenFrom) {
          return drop("bleed: the other party was talking at the same time");
        }

        // Before the other party has answered, my words go nowhere; their first words
        // ("hello?") prove the call is connected.
        if (awaitingAnswerRef.current) {
          if (dir.who === "me") return drop("waiting for the other party to answer");
          awaitingAnswerRef.current = false;
          setAwaitingAnswer(false);
        }

        const from = spokenLang;
        const to = dir.target();
        logDiagnostic("phrase", { who: dir.who, lang: from, to, text: text.slice(0, 80) });

        const entry: TranscriptEntry = {
          id: nextIdRef.current++,
          who: dir.who,
          time: formatClock(heardAt - callStart),
          original: text,
          translation: "",
          toLang: to,
          status: "pending",
        };
        const context = transcriptRef.current.slice(-TRANSLATION_CONTEXT);
        commit([...transcriptRef.current, entry]);

        const screening = dir.screening;
        // Instant keyword check: warn before the AI has even answered.
        const instantRisk = screening ? detectScam(text) : null;
        if (screening && instantRisk) raiseAlert(entry, instantRisk, screening.alertDevice);

        const allowReply = options.autoAnswer && !instantRisk;
        const profile = options.profile;

        // Keep each direction in order: translate → synthesize → queue playback.
        queue = queue.then(async () => {
          try {
            const result: AutoResponse = screening
              ? await api.respond(text, from, to, context, { profile, allowReply })
              : { ...NO_REPLY, translation: await api.translate(text, from, to, context) };

            patchEntry(entry.id, {
              translation: result.translation,
              status: "done",
              note: result.needs_user ? result.note : undefined,
            });
            const current = transcriptRef.current.find((e) => e.id === entry.id) ?? entry;
            if (screening) raiseAlert(current, result.risk, screening.alertDevice);

            const risky = Boolean(instantRisk) || isRisky(result.risk);
            const replyPlayer = screening && allowReply && !risky ? screening.replyPlayer : null;
            const reply = replyPlayer ? result.reply.trim() : "";
            const [audio, replyAudio] = await Promise.all([
              speech.synthesize(result.translation, to, voice),
              reply ? speech.synthesize(reply, from, voice) : null,
            ]);

            dir.player.enqueue(audio, () => {
              const latencyMs = Date.now() - heardAt;
              patchEntry(entry.id, { latencyMs });
              setLastLatency(latencyMs);
            });

            if (replyPlayer && replyAudio) {
              const replyEntry: TranscriptEntry = {
                id: nextIdRef.current++,
                who: "ai",
                time: formatClock(Date.now() - callStart),
                original: reply,
                translation: result.reply_translation,
                toLang: to,
                status: "done",
              };
              commit([...transcriptRef.current, replyEntry]);
              replyPlayer.enqueue(replyAudio, () =>
                patchEntry(replyEntry.id, { latencyMs: Date.now() - heardAt }),
              );
            }
          } catch (err) {
            patchEntry(entry.id, { status: "error", error: errorMessage(err) });
            logDiagnostic("phrase:error", { who: dir.who, error: errorMessage(err) });
          }
        });
      };
    },
    [commit, patchEntry, raiseAlert],
  );

  const start = useCallback(
    async ({
      myLang,
      friendLang,
      voice,
      devices,
      monitorOriginal,
      waitForAnswer = false,
    }: CallSettings) => {
      setStatus("connecting");
      const speech = new SpeechService();
      speechRef.current = speech;

      try {
        audioContext(); // created inside the click handler so the browser allows audio
        await speech.connect((err) =>
          notify(`${tr("Token yenilənmədi", "Token refresh failed")}: ${err.message}`, "error"),
        );
        speech.prewarm([
          { lang: friendLang, gender: voice },
          { lang: myLang, gender: voice },
        ]);

        const micStream = await openInputStream(devices.myMic, false);
        streamsRef.current = [micStream]; // index 0 = my mic (mute toggles it)
        mutedRef.current = false;
        setMuted(false);
        // No call input (public demo): the other party is simulated with typed phrases.
        const hasCallInput = Boolean(devices.callIn);
        const callAudio = hasCallInput ? new CallAudio(notify) : null;
        callAudioRef.current = callAudio;
        await callAudio?.open(devices.callIn);
        const callStream =
          callAudio?.stream ?? audioContext().createMediaStreamDestination().stream;

        const onPlaybackError = (err: Error) =>
          notify(`${tr("Səs çalınmadı", "Playback failed")}: ${err.message}`, "error");
        const players = {
          toMe: new ClipPlayer(devices.myOut, onPlaybackError),
          toFriend: new ClipPlayer(devices.callOut, onPlaybackError),
        };
        const analysers = {
          me: new StreamAnalyser(micStream),
          friend: new StreamAnalyser(callStream),
        };
        mediaRef.current = { analysers, players };

        const callInIsLoopback = isPlaybackCapture(callAudio?.label ?? "");
        const callStart = Date.now();
        commit([]);
        setAlerts([]);
        friendLangRef.current = friendLang;
        setActiveFriendLang(friendLang);
        awaitingAnswerRef.current = waitForAnswer;
        setAwaitingAnswer(waitForAnswer);
        setLastLatency(null);
        setStartedAt(callStart);

        const onRecognitionError = (message: string) => {
          logDiagnostic("recognizer:error", { message });
          notify(`${tr("Səs tanıma xətası", "Speech recognition error")}: ${message}`, "error");
        };
        await Promise.all([
          speech.startRecognizer(micStream, [myLang], {
            onPartial: (text) => setPartials((p) => ({ ...p, me: text })),
            onPhrase: createPhraseHandler(speech, callStart, voice, {
              who: "me",
              target: () => friendLangRef.current ?? friendLang,
              player: players.toFriend,
              echoSource: players.toMe,
            }),
            onError: onRecognitionError,
          }),
          // The other party's language is fixed for the whole call (chosen before it starts,
          // e.g. from the country code): automatic switching mid-call caused wrong guesses.
          hasCallInput &&
            speech.startRecognizer(callStream, [friendLang], {
              onPartial: (text) => {
                setPartials((p) => ({ ...p, friend: text }));
                if (text) friendHeardAtRef.current = Date.now();
                // The first recognized sound of their voice means they picked up. Ringback
                // tones are never recognized as words, and a short "hello?" may never become
                // a full phrase, so the partial result is the earliest reliable signal.
                if (text && awaitingAnswerRef.current) markAnswered();
              },
              onPhrase: createPhraseHandler(speech, callStart, voice, {
                who: "friend",
                target: () => myLang,
                player: players.toMe,
                // A loopback input ("Stereo Mix") also hears the AI speaking to me.
                echoSource: callInIsLoopback
                  ? anyActive(players.toFriend, players.toMe)
                  : players.toFriend,
                screening: { replyPlayer: players.toFriend, alertDevice: devices.myOut },
              }),
              onError: onRecognitionError,
            }),
        ]);

        // Typed "other party" phrases (demo) take the same path as recognized speech.
        const simulated = createPhraseHandler(speech, callStart, voice, {
          who: "friend",
          target: () => myLang,
          player: players.toMe,
          echoSource: { wasActiveSince: () => false },
          screening: { replyPlayer: players.toFriend, alertDevice: devices.myOut },
        });
        simulateRef.current = (text: string) => simulated(text, 0, friendLang);

        if (monitorOriginal && hasCallInput) {
          const monitor = new Audio();
          monitor.srcObject = callStream;
          monitor.volume = 0.25;
          await routeToDevice(monitor, devices.myOut);
          await monitor.play();
          monitorRef.current = monitor;
        }

        setMedia(mediaRef.current);
        logDiagnostic("call:live", { myLang, friendLang, waitForAnswer });
        clearInterval(diagTimerRef.current);
        diagTimerRef.current = setInterval(() => {
          logDiagnostic("levels", {
            me: Number(analysers.me.level().toFixed(4)),
            friend: Number(analysers.friend.level().toFixed(4)),
            aiToMe: players.toMe.playing,
            aiToFriend: players.toFriend.playing,
            awaitingAnswer: awaitingAnswerRef.current,
          });
        }, 2000);
        setStatus("live");
      } catch (err) {
        notify(`${tr("Başlamaq alınmadı", "Could not start")}: ${errorMessage(err)}`, "error");
        await teardown();
        setStatus("error");
      }
    },
    [commit, createPhraseHandler, markAnswered, notify, teardown],
  );

  /** Ends the call and returns what was said, for the report. */
  const stop = useCallback(async (): Promise<FinishedCall> => {
    const duration = formatClock(startedAt ? Date.now() - startedAt : 0);
    await teardown();
    setStatus("ended");
    return {
      transcript: transcriptRef.current,
      duration,
      friendLang: friendLangRef.current ?? undefined,
      startedAt: startedAt ?? undefined,
    };
  }, [startedAt, teardown]);

  return {
    status,
    isLive: status === "live",
    startedAt,
    transcript,
    partials,
    analysers: media?.analysers ?? null,
    players: media?.players ?? null,
    lastLatency,
    alerts,
    dismissAlert,
    /** Auto-started call: waiting for the other party's first words. */
    awaitingAnswer: awaitingAnswer && status === "live",
    /** The other party's language as currently detected (null when no call). */
    activeFriendLang: status === "live" ? activeFriendLang : null,
    markAnswered,
    /** My microphone is muted (only meaningful during a call). */
    muted: muted && status === "live",
    toggleMute,
    /** Demo: treat typed text as something the other party said. */
    simulateFriend: (text: string) => simulateRef.current?.(text),
    start,
    stop,
  };
}
