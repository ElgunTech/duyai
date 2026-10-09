const RETRY_DELAY_MS = 400;

/** Network-level failures (no answer at all), as opposed to an HTTP error from the service. */
const isNetworkError = (err) =>
  err?.name === "TimeoutError" || err?.name === "AbortError" || err?.message === "fetch failed";

/**
 * Runs a request again after a short pause if the network dropped (Wi-Fi hiccups during a
 * call should not end it). HTTP errors such as a wrong key are not retried.
 */
export async function withNetworkRetry(request, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      if (attempt >= attempts || !isNetworkError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}
