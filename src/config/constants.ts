/** Pause (ms) after which Azure closes a phrase; shorter = faster translation, more fragments. */
export const SILENCE_MS = 600;

/** RMS level above which a side counts as speaking. */
export const SPEAKING_LEVEL = 0.035;

/** Extra margin (ms) when deciding whether a phrase overlapped AI playback. */
export const ECHO_MARGIN_MS = 200;

/** Azure tokens live 10 minutes; refresh a bit earlier. */
export const TOKEN_REFRESH_MS = 9 * 60 * 1000;

export const HEALTH_POLL_MS = 60_000;

/** Number of previous lines sent to the translator as context. */
export const TRANSLATION_CONTEXT = 6;

export const WAVE_BARS = 32;

/** Auto start: call audio louder than this (RMS)… */
export const AUTO_START_LEVEL = 0.006;
/** …for this long starts the translation (ringback tone or the first "hello"). */
export const AUTO_START_MS = 700;
/** Auto end: the call line back at its idle level this long means the call has ended. */
export const AUTO_END_MS = 15_000;
