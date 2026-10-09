import { describe, expect, it } from "vitest";
import type { DeviceSelection } from "../types";
import {
  cableFamily,
  displayLabel,
  findPhoneCallInput,
  isPlaybackCapture,
  hasVirtualCables,
  pickDevice,
  validateSelection,
  type AudioDevice,
} from "./devices";

const input = (deviceId: string, label: string): AudioDevice => ({
  deviceId,
  label,
  kind: "audioinput",
});
const output = (deviceId: string, label: string): AudioDevice => ({
  deviceId,
  label,
  kind: "audiooutput",
});

/** VB-CABLE + Voicemeeter, as on the demo laptop. */
const freeSetup: AudioDevice[] = [
  input("default", "Default - Mikrofon (Realtek(R) Audio)"),
  input("mic", "Mikrofon (Realtek(R) Audio)"),
  input("cable", "CABLE Output (VB-Audio Virtual Cable)"),
  input("vmB1", "Voicemeeter Out B1 (VB-Audio Voicemeeter VAIO)"),
  output("default", "Default - Hoparlör (Realtek(R) Audio)"),
  output("speaker", "Hoparlör (Realtek(R) Audio)"),
  output("cableIn", "CABLE Input (VB-Audio Virtual Cable)"),
  output("vmIn", "Voicemeeter Input (VB-Audio Voicemeeter VAIO)"),
];

const abSetup: AudioDevice[] = [
  input("mic", "Microphone (Realtek)"),
  input("aOut", "CABLE-A Output (VB-Audio Cable A)"),
  input("bOut", "CABLE-B Output (VB-Audio Cable B)"),
  output("phones", "Headphones (Realtek)"),
  output("aIn", "CABLE-A Input (VB-Audio Cable A)"),
  output("bIn", "CABLE-B Input (VB-Audio Cable B)"),
];

const autoSelect = (devices: AudioDevice[]): DeviceSelection => ({
  myMic: pickDevice("myMic", devices),
  myOut: pickDevice("myOut", devices),
  callIn: pickDevice("callIn", devices),
  callOut: pickDevice("callOut", devices),
});

describe("cableFamily", () => {
  it("identifies each virtual cable", () => {
    expect(cableFamily("CABLE-A Output")).toBe("A");
    expect(cableFamily("CABLE-B Input")).toBe("B");
    expect(cableFamily("CABLE Output (VB-Audio Virtual Cable)")).toBe("C");
    expect(cableFamily("Voicemeeter Input (VB-Audio Voicemeeter VAIO)")).toBe("VM");
    expect(cableFamily("Mikrofon (Realtek)")).toBeNull();
  });
});

describe("pickDevice", () => {
  it("auto-selects the free VB-CABLE + Voicemeeter setup", () => {
    expect(autoSelect(freeSetup)).toEqual({
      myMic: "mic",
      myOut: "speaker",
      callIn: "cable",
      callOut: "vmIn",
    });
  });

  it("auto-selects the VB-CABLE A+B setup", () => {
    expect(autoSelect(abSetup)).toEqual({
      myMic: "mic",
      myOut: "phones",
      callIn: "aOut",
      callOut: "bIn",
    });
  });

  it("keeps a saved personal device", () => {
    expect(pickDevice("myOut", freeSetup, "default")).toBe("default");
  });

  it("replaces a saved call device that is not a virtual cable", () => {
    expect(pickDevice("callOut", freeSetup, "speaker")).toBe("vmIn");
  });

  it("ignores a saved device that no longer exists", () => {
    expect(pickDevice("myMic", freeSetup, "unplugged-usb-mic")).toBe("mic");
  });
});

describe("hasVirtualCables", () => {
  it("needs two different cables", () => {
    expect(hasVirtualCables(freeSetup)).toBe(true);
    expect(hasVirtualCables(abSetup)).toBe(true);
    const singleCable = freeSetup.filter((d) => !/voicemeeter/i.test(d.label));
    expect(hasVirtualCables(singleCable)).toBe(false);
  });
});

describe("validateSelection", () => {
  it("accepts a correct setup", () => {
    expect(validateSelection(freeSetup, autoSelect(freeSetup))).toEqual([]);
  });

  it("rejects the same cable on both call paths (feedback loop)", () => {
    const selection = { ...autoSelect(freeSetup), callOut: "cableIn" };
    const messages = validateSelection(freeSetup, selection).map((i) => i.message);
    expect(messages.some((m) => m.includes("same cable"))).toBe(true); // English by default
  });

  it("rejects a virtual cable as the user's microphone", () => {
    const selection = { ...autoSelect(freeSetup), myMic: "vmB1" };
    expect(validateSelection(freeSetup, selection).some((i) => i.level === "error")).toBe(true);
  });

  it("reports missing cables", () => {
    const physicalOnly = freeSetup.filter((d) => !/cable|voicemeeter/i.test(d.label));
    const [issue] = validateSelection(physicalOnly, autoSelect(physicalOnly));
    expect(issue?.level).toBe("error");
  });
});

describe("displayLabel", () => {
  it("marks Windows default aliases and strips USB ids", () => {
    expect(displayLabel(output("default", "Default - Speakers (1234:abcd)"))).toBe(
      "System default · Speakers",
    );
    expect(displayLabel(input("communications", "Communications - Mic"))).toBe(
      "Communications default · Mic",
    );
  });
});

describe("findPhoneCallInput", () => {
  it("finds the phone's Bluetooth call audio and ignores headsets", () => {
    const devices = [
      ...freeSetup,
      input("headset", "Kulaklık (EW97 Hands-Free AG Audio)"),
      input("phone", "Mikrofon (elgunbutgenius Hands-Free HF Audio)"),
    ];
    expect(findPhoneCallInput(devices)?.deviceId).toBe("phone");
    expect(findPhoneCallInput(freeSetup)).toBeUndefined();
  });
});

describe("Bluetooth headset call profile", () => {
  const withBuds = [
    ...freeSetup,
    output("budsHf", "Kulaklık (Redmi Buds 6 Lite Hands-Free AG Audio)"),
    output("budsStereo", "Kulaklıklar (Redmi Buds 6 Lite Stereo)"),
  ];

  it("is rejected because it blocks the phone's call audio", () => {
    const selection = { ...autoSelect(withBuds), myOut: "budsHf" };
    expect(validateSelection(withBuds, selection).some((i) => /Hands-Free/.test(i.message))).toBe(
      true,
    );
  });

  it("is never picked automatically", () => {
    const onlyBuds = withBuds.filter((d) => d.deviceId !== "speaker" && d.deviceId !== "default");
    expect(pickDevice("myOut", onlyBuds)).toBe("budsStereo");
  });
});

describe("isPlaybackCapture", () => {
  it("recognizes Stereo Mix in English and Turkish Windows", () => {
    expect(isPlaybackCapture("Stereo Mix (Realtek(R) Audio)")).toBe(true);
    expect(isPlaybackCapture("Stereo Karışımı (Realtek(R) Audio)")).toBe(true);
    expect(isPlaybackCapture("CABLE Output (VB-Audio Virtual Cable)")).toBe(false);
  });
});

describe("interface language", () => {
  it("shows validation messages in Azerbaijani when AZ is chosen", async () => {
    const { setUiLangGlobal } = await import("../i18n/i18n");
    setUiLangGlobal("az");
    try {
      const selection = { ...autoSelect(freeSetup), callOut: "cableIn" };
      const messages = validateSelection(freeSetup, selection).map((i) => i.message);
      expect(messages.some((m) => m.includes("eyni kabel"))).toBe(true);
    } finally {
      setUiLangGlobal("en");
    }
  });
});
