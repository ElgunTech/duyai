import { useEffect, useState, type RefObject } from "react";
import { SPEAKING_LEVEL, WAVE_BARS } from "../config/constants";
import type { ClipPlayer, StreamAnalyser } from "../lib/audio";
import type { PartyState } from "../types";

interface Options {
  /** Live input of this side (null when no call is running). */
  analyser: StreamAnalyser | null;
  /** Player that speaks translations *to* this side. */
  player: ClipPlayer | null;
  /** Container whose children are the waveform bars. */
  waveRef: RefObject<HTMLElement | null>;
  /**
   * Phone mode: the audio lives on the server, so the state comes from server events
   * and the waveform is drawn synthetically.
   */
  externalState?: PartyState;
}

const MAX_BAR_PX = 40;

function setBars(container: HTMLElement, values: (i: number) => number) {
  const bars = container.children;
  for (let i = 0; i < bars.length; i++) {
    (bars[i] as HTMLElement).style.height = `${Math.max(3, Math.round(values(i) * MAX_BAR_PX))}px`;
  }
}

/** A calm moving wave for audio we can see happening but cannot analyse. */
const syntheticWave = (i: number) => {
  const t = performance.now() / 1000;
  return 0.25 + 0.5 * Math.abs(Math.sin(t * 7 + i * 0.55) * Math.cos(t * 3.1 + i * 0.3));
};

/** Draws the synthetic wave while `state` is active; flat bars otherwise. */
function useSyntheticWave(state: PartyState | undefined, waveRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const wave = waveRef.current;
    if (!wave || state === undefined) return;
    if (state !== "speaking" && state !== "ai") {
      setBars(wave, () => 0);
      return;
    }
    let frame = 0;
    const tick = () => {
      setBars(wave, syntheticWave);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [state, waveRef]);
}

/**
 * Animates a party's waveform and reports whether that side is silent, speaking,
 * or currently hearing the AI voice. Bars are written to the DOM directly;
 * React only re-renders when the state label changes.
 */
export function usePartyActivity({
  analyser,
  player,
  waveRef,
  externalState,
}: Options): PartyState {
  const [state, setState] = useState<PartyState>("off");
  useSyntheticWave(externalState, waveRef);

  useEffect(() => {
    const wave = waveRef.current;
    if (externalState !== undefined) return; // phone mode draws its own wave
    if (!analyser || !wave) {
      setState("off");
      if (wave) setBars(wave, () => 0);
      return;
    }

    let frame = 0;
    let current: PartyState = "off";
    const update = (next: PartyState) => {
      if (next !== current) {
        current = next;
        setState(next);
      }
    };

    const tick = () => {
      if (player?.playing) {
        // The AI voice is not captured by an analyser, so draw a calm synthetic wave.
        setBars(wave, syntheticWave);
        update("ai");
      } else {
        const bands = analyser.bands(WAVE_BARS);
        setBars(wave, (i) => Math.min(1, (bands[i] ?? 0) * 1.3));
        update(analyser.level() > SPEAKING_LEVEL ? "speaking" : "listening");
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [analyser, player, waveRef, externalState]);

  return externalState ?? state;
}
