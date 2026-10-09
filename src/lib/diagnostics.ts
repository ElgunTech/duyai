/**
 * Sends call diagnostics to the local server log (POST /api/diagnostics), so problems
 * on the audio path can be investigated without access to the browser console.
 * Fire-and-forget; never throws.
 */
export function logDiagnostic(event: string, data: Record<string, unknown> = {}): void {
  try {
    const body = JSON.stringify({ event, data, at: new Date().toISOString() });
    if (
      !navigator.sendBeacon?.("/api/diagnostics", new Blob([body], { type: "application/json" }))
    ) {
      void fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* diagnostics must never break the call */
  }
}
