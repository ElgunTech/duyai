import type { DeviceIssue, DeviceRole, DeviceSelection } from "../types";
import { tr } from "../i18n/i18n";

/** The subset of MediaDeviceInfo this module needs (keeps it testable without a browser). */
export interface AudioDevice {
  deviceId: string;
  kind: MediaDeviceKind;
  label: string;
}

export const ROLE_KIND: Record<DeviceRole, MediaDeviceKind> = {
  myMic: "audioinput",
  myOut: "audiooutput",
  callIn: "audioinput",
  callOut: "audiooutput",
};

/**
 * Two supported virtual-audio setups:
 *  - VB-CABLE A+B: CABLE-A carries the call in, CABLE-B carries the AI voice out.
 *  - VB-CABLE + Voicemeeter (free): CABLE carries the call in, Voicemeeter carries the AI voice out.
 * Patterns are ordered by preference.
 */
const CALL_PATTERNS: Record<"callIn" | "callOut", RegExp[]> = {
  // Stereo Mix first: it works without per-app routing (the call plays on the speakers).
  callIn: [/stereo (mix|karışımı)/i, /cable-a output/i, /^cable output/i],
  callOut: [/cable-b input/i, /voicemeeter input/i, /voicemeeter vaio/i, /voicemeeter/i],
};

const VIRTUAL = /cable|voicemeeter/i;
const SYSTEM_IDS = new Set(["default", "communications"]);

export const isVirtual = (label: string) => VIRTUAL.test(label);

/**
 * "Stereo Mix" records everything the sound card plays: the call, but also the AI voice
 * meant for my headphones (the echo guard must account for both).
 */
export const isPlaybackCapture = (label: string) =>
  /stereo (mix|karışımı)|what u hear/i.test(label);

/**
 * A Bluetooth headset in its "Hands-Free" (call) profile. Most laptop adapters carry only
 * one such call channel at a time, so using it blocks the phone's call audio from reaching
 * this PC. Its "Stereo" profile does not have this problem.
 */
export const isHeadsetCallProfile = (label: string) => /hands-free ag audio/i.test(label);

const matchesAny = (patterns: RegExp[], label: string) => patterns.some((re) => re.test(label));

/** Which virtual cable a device belongs to. The same cable on both call paths would loop audio. */
export function cableFamily(label: string): "A" | "B" | "VM" | "C" | null {
  if (/cable-a/i.test(label)) return "A";
  if (/cable-b/i.test(label)) return "B";
  if (/voicemeeter/i.test(label)) return "VM";
  if (/cable/i.test(label)) return "C";
  return null;
}

/** Human-friendly label: marks Windows "default"/"communications" aliases, drops USB ids. */
export function displayLabel(device: AudioDevice): string {
  let label = device.label || tr("Naməlum cihaz", "Unknown device");
  if (device.deviceId === "default")
    label = `${tr("Sistem standartı", "System default")} · ${label.replace(/^Default - /i, "")}`;
  if (device.deviceId === "communications") {
    label = `${tr("Rabitə standartı", "Communications default")} · ${label.replace(/^Communications - /i, "")}`;
  }
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
}

/** True when the machine has two distinct virtual cables for the two call directions. */
export function hasVirtualCables(devices: AudioDevice[]): boolean {
  const ins = devices.filter(
    (d) => d.kind === "audioinput" && matchesAny(CALL_PATTERNS.callIn, d.label),
  );
  const outs = devices.filter(
    (d) => d.kind === "audiooutput" && matchesAny(CALL_PATTERNS.callOut, d.label),
  );
  return ins.some((i) => outs.some((o) => cableFamily(i.label) !== cableFamily(o.label)));
}

/**
 * Chooses the device for a role. A saved choice is kept unless it is clearly wrong for a call
 * role (not a virtual cable), in which case the best matching cable is detected again.
 */
export function pickDevice(
  role: DeviceRole,
  devices: AudioDevice[],
  saved?: string | null,
): string {
  const list = devices.filter((d) => d.kind === ROLE_KIND[role]);
  const real = list.filter((d) => !SYSTEM_IDS.has(d.deviceId));
  const savedDevice = saved ? list.find((d) => d.deviceId === saved) : undefined;

  if (role === "callIn" || role === "callOut") {
    const patterns = CALL_PATTERNS[role];
    if (savedDevice && matchesAny(patterns, savedDevice.label)) return savedDevice.deviceId;
    const detected = patterns
      .map((re) => real.find((d) => re.test(d.label)))
      .find((d): d is AudioDevice => Boolean(d));
    return (detected ?? savedDevice ?? list[0])?.deviceId ?? "";
  }

  if (savedDevice) return savedDevice.deviceId;
  // The user's own mic/headphones: prefer physical devices, and avoid headset call profiles.
  const usable = real.filter((d) => !isVirtual(d.label));
  return (
    (usable.find((d) => !isHeadsetCallProfile(d.label)) ?? usable[0] ?? list[0])?.deviceId ?? ""
  );
}

/** Checks a device selection for setups that cannot work or would create feedback loops. */
export function validateSelection(
  devices: AudioDevice[],
  selection: DeviceSelection,
): DeviceIssue[] {
  const issues: DeviceIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  const warning = (message: string) => issues.push({ level: "warning", message });
  const label = (role: DeviceRole) =>
    devices.find((d) => d.kind === ROLE_KIND[role] && d.deviceId === selection[role])?.label ?? "";

  const cablesReady = hasVirtualCables(devices);
  if (!devices.some((d) => isVirtual(d.label))) {
    error(
      tr(
        "Virtual kabel tapılmadı. Quraşdırma bələdçisinə baxın.",
        "No virtual audio cable found. See the setup guide.",
      ),
    );
  } else if (!cablesReady) {
    error(
      tr(
        "İki ayrı virtual kabel lazımdır: VB-CABLE A+B, ya da VB-CABLE + Voicemeeter.",
        "Two separate virtual cables are needed: VB-CABLE A+B, or VB-CABLE + Voicemeeter.",
      ),
    );
  }

  if (isVirtual(label("myMic")))
    error(
      tr("“Mikrofonum” virtual kabel ola bilməz.", "“My microphone” cannot be a virtual cable."),
    );
  if (isVirtual(label("myOut")))
    error(
      tr("“Qulaqlığım” virtual kabel ola bilməz.", "“My headphones” cannot be a virtual cable."),
    );
  if (isHeadsetCallProfile(label("myOut")) || isHeadsetCallProfile(label("myMic"))) {
    error(
      tr(
        "Bluetooth qulaqlığın “Hands-Free” variantı telefonun zəng səsini kompüterə buraxmır. Qulaqlıq üçün “Stereo” variantını, mikrofon üçün noutbukun mikrofonunu seçin.",
        "A Bluetooth headset in “Hands-Free” mode blocks the phone's call audio. Pick its “Stereo” variant for headphones and the laptop microphone for the mic.",
      ),
    );
  }
  if (selection.myMic && selection.myMic === selection.callIn) {
    error(
      tr(
        "Mikrofon ilə zəngdən gələn səs eyni cihaz ola bilməz.",
        "The microphone and the call input cannot be the same device.",
      ),
    );
  }
  if (selection.myOut && selection.myOut === selection.callOut) {
    error(
      tr(
        "Qulaqlıq ilə zəngə gedən səs eyni cihaz ola bilməz.",
        "The headphones and the call output cannot be the same device.",
      ),
    );
  }

  const inFamily = cableFamily(label("callIn"));
  if (inFamily && inFamily === cableFamily(label("callOut"))) {
    error(
      tr(
        "Zəngdən gələn və gedən səs eyni kabel ola bilməz, səs dövrəyə girər.",
        "Call input and output cannot use the same cable: the audio would loop.",
      ),
    );
  }

  if (cablesReady && !matchesAny(CALL_PATTERNS.callIn, label("callIn"))) {
    warning(
      tr(
        "“Zəngdən gələn” üçün CABLE Output və ya Stereo Karışımı seçin.",
        "For “Call in”, choose CABLE Output or Stereo Mix.",
      ),
    );
  }
  if (cablesReady && !matchesAny(CALL_PATTERNS.callOut, label("callOut"))) {
    warning(
      tr(
        "“Zəngə gedən” üçün Voicemeeter Input (və ya CABLE-B Input) seçin.",
        "For “Call out”, choose Voicemeeter Input (or CABLE-B Input).",
      ),
    );
  }
  return issues;
}

/**
 * During a Phone Link call Windows exposes the phone's Bluetooth audio as an input device
 * ("Microphone (<phone> Hands-Free HF Audio)") carrying the other party's voice. Reading it
 * directly does not depend on the per-app routing to a virtual cable. Headsets connected to
 * this PC show up as "Hands-Free AG Audio" and are ignored.
 */
export function findPhoneCallInput(devices: AudioDevice[]): AudioDevice | undefined {
  return devices.find(
    (d) =>
      d.kind === "audioinput" &&
      !SYSTEM_IDS.has(d.deviceId) &&
      /hands-free hf audio/i.test(d.label),
  );
}
