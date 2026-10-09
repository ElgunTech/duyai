import { spawn } from "node:child_process";

/**
 * Detects Phone Link calls on Windows. While a call is active, Windows enables the phone's
 * Bluetooth "Hands-Free HF Audio" endpoints (status OK); otherwise they are "Unknown".
 * A long-running PowerShell loop reports that state; it runs only while the browser polls.
 */

const POLL_MS = 700;
const IDLE_SHUTDOWN_MS = 15_000;

// "HF Audio" is the phone (Hands-Free unit role of this PC); headsets show as "AG Audio".
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $on = @(Get-PnpDevice -Class AudioEndpoint -Status OK | Where-Object { $_.FriendlyName -match 'Hands-Free HF Audio' }).Count -gt 0
  [Console]::Out.WriteLine([int]$on)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${POLL_MS}
}`;

export const callDetectSupported = process.platform === "win32";

let child = null;
let inCall = false;
let lastQuery = 0;
let idleTimer = null;

function start() {
  if (child || !callDetectSupported) return;
  child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT], {
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    const last = chunk.trim().split(/\s+/).pop();
    if (last === "0" || last === "1") inCall = last === "1";
  });
  child.on("exit", () => {
    child = null;
    inCall = false;
  });
  idleTimer = setInterval(() => {
    if (Date.now() - lastQuery > IDLE_SHUTDOWN_MS) stop();
  }, IDLE_SHUTDOWN_MS);
  idleTimer.unref();
}

function stop() {
  clearInterval(idleTimer);
  child?.kill();
  child = null;
  inCall = false;
}

process.once("exit", stop);

/** Current call state; the first query starts the watcher, so the answer may lag by ~1 s. */
export function getCallState() {
  lastQuery = Date.now();
  start();
  return { supported: callDetectSupported, inCall, watching: Boolean(child) };
}
