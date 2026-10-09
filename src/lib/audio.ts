import { tr } from "../i18n/i18n";
let sharedContext: AudioContext | null = null;

/** One AudioContext for all analysers; resumed on demand (browsers start it suspended). */
export function audioContext(): AudioContext {
  sharedContext ??= new AudioContext();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
}

/**
 * Opens an input device. Call audio is already processed by the phone network,
 * so browser echo cancellation / noise suppression would only damage it.
 */
export function openInputStream(deviceId: string, isCallAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: !isCallAudio,
      noiseSuppression: !isCallAudio,
      autoGainControl: !isCallAudio,
    },
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

type SinkCapable = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** Routes a media element to a specific output device ("default" keeps the system device). */
export async function routeToDevice(element: HTMLMediaElement, deviceId: string): Promise<void> {
  const el = element as SinkCapable;
  if (!deviceId || deviceId === "default") return;
  if (!el.setSinkId)
    throw new Error(
      tr(
        "Bu brauzer çıxış cihazı seçməyi dəstəkləmir (Chrome/Edge istifadə edin)",
        "This browser cannot choose an output device (use Chrome or Edge)",
      ),
    );
  await el.setSinkId(deviceId);
}

/** Level and spectrum readings for a live stream, used by meters and waveforms. */
export class StreamAnalyser {
  private readonly source: MediaStreamAudioSourceNode;
  private readonly node: AnalyserNode;
  private readonly time: Float32Array<ArrayBuffer>;
  private readonly freq: Uint8Array<ArrayBuffer>;

  constructor(stream: MediaStream) {
    const ctx = audioContext();
    this.source = ctx.createMediaStreamSource(stream);
    this.node = ctx.createAnalyser();
    this.node.fftSize = 1024;
    this.node.smoothingTimeConstant = 0.6;
    this.source.connect(this.node);
    this.time = new Float32Array(this.node.fftSize);
    this.freq = new Uint8Array(this.node.frequencyBinCount);
  }

  /** RMS level, roughly 0 (silence) to 0.3 (loud speech). */
  level(): number {
    this.node.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (const sample of this.time) sum += sample * sample;
    return Math.sqrt(sum / this.time.length);
  }

  /** `count` bands (0..1) across the speech range of the spectrum. */
  bands(count: number): number[] {
    this.node.getByteFrequencyData(this.freq);
    const usable = Math.floor(this.freq.length * 0.45);
    const step = Math.max(1, Math.floor(usable / count));
    return Array.from({ length: count }, (_, i) => {
      let peak = 0;
      for (let j = i * step; j < (i + 1) * step; j++) peak = Math.max(peak, this.freq[j] ?? 0);
      return peak / 255;
    });
  }

  dispose(): void {
    this.source.disconnect();
  }
}

/** Plays an encoded clip on a chosen output device and resolves when it ends. */
export async function playClip(
  data: ArrayBuffer,
  deviceId: string,
  mimeType = "audio/mpeg",
  onStart?: () => void,
): Promise<void> {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const audio = new Audio(url);
  try {
    await routeToDevice(audio, deviceId);
    await new Promise<void>((resolve, reject) => {
      audio.onplaying = () => onStart?.();
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error(tr("Səs çalınmadı", "Audio playback failed")));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Queues clips on one output device so translations never overlap,
 * and remembers when it was busy (used by the echo guard).
 */
export class ClipPlayer {
  playing = false;
  private lastEnd = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly deviceId: string,
    private readonly onError: (err: Error) => void,
  ) {}

  enqueue(data: ArrayBuffer, onStart?: () => void): void {
    this.queue = this.queue
      .then(async () => {
        this.playing = true;
        try {
          await playClip(data, this.deviceId, "audio/mpeg", onStart);
        } finally {
          this.playing = false;
          this.lastEnd = Date.now();
        }
      })
      .catch((err: Error) => this.onError(err));
  }

  /** True if this player made sound at any point since `since` (epoch ms). */
  wasActiveSince(since: number): boolean {
    return this.playing || this.lastEnd > since;
  }
}

interface Beep {
  start: number;
  duration: number;
  freq: number;
}

/** Renders a sequence of soft-edged sine beeps as a 24 kHz, 16-bit mono WAV. */
function renderBeeps(beeps: Beep[], volume = 0.35): ArrayBuffer {
  const rate = 24_000;
  const totalSeconds = Math.max(...beeps.map((b) => b.start + b.duration)) + 0.05;
  const samples = Math.floor(rate * totalSeconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) =>
    [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples * 2, true);

  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const beep = beeps.find((b) => t >= b.start && t < b.start + b.duration);
    let value = 0;
    if (beep) {
      const local = t - beep.start;
      const envelope = Math.min(1, local * 40, (beep.duration - local) * 40); // 25 ms fades
      value = Math.sin(2 * Math.PI * beep.freq * t) * volume * envelope;
    }
    view.setInt16(44 + i * 2, value * 32767, true);
  }
  return buffer;
}

/** Two short rising beeps for testing output devices. */
export function createTestTone(): ArrayBuffer {
  return renderBeeps([
    { start: 0, duration: 0.25, freq: 660 },
    { start: 0.4, duration: 0.25, freq: 880 },
  ]);
}

/** Three quick high beeps that cut through speech: the scam warning. */
export function createAlertTone(): ArrayBuffer {
  return renderBeeps(
    [0, 0.18, 0.36].map((start) => ({ start, duration: 0.12, freq: 1320 })),
    0.4,
  );
}
