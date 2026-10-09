import { useEffect, type RefObject } from "react";
import type { StreamAnalyser } from "../lib/audio";

/**
 * Drives a level bar from an analyser. Writes straight to the DOM each frame
 * so the meter animates without re-rendering React.
 */
export function useLevelMeter(
  analyser: StreamAnalyser | null,
  barRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (!analyser) {
      bar.style.width = "0";
      return;
    }
    let frame = 0;
    const tick = () => {
      bar.style.width = `${Math.min(100, analyser.level() * 400)}%`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      bar.style.width = "0";
    };
  }, [analyser, barRef]);
}
