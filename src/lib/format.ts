/** 83_000 → "01:23" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** 2340 → "2.3 s" */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export type LatencyGrade = "good" | "mid" | "slow";

export function gradeLatency(ms: number): LatencyGrade {
  if (ms < 2500) return "good";
  if (ms < 4000) return "mid";
  return "slow";
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
