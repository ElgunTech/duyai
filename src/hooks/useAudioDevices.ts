import { useCallback, useEffect, useMemo, useState } from "react";
import { hasVirtualCables, pickDevice, validateSelection, type AudioDevice } from "../lib/devices";
import { storage } from "../lib/storage";
import type { DeviceRole, DeviceSelection } from "../types";

const ROLES: DeviceRole[] = ["myMic", "myOut", "callIn", "callOut"];
const EMPTY: DeviceSelection = { myMic: "", myOut: "", callIn: "", callOut: "" };
const storageKey = (role: DeviceRole) => `device.${role}`;

/**
 * Lists audio devices, picks sensible defaults (virtual cables for the call paths),
 * remembers the user's choices and reports setups that cannot work.
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selection, setSelection] = useState<DeviceSelection>(EMPTY);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const refresh = useCallback(async (askPermission = true) => {
    try {
      if (askPermission) {
        // Device labels are only exposed after microphone permission is granted.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
      }
      const list = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
        .map(({ deviceId, kind, label }) => ({ deviceId, kind, label }));

      setDevices(list);
      setSelection((current) => {
        const next = { ...current };
        for (const role of ROLES) {
          next[role] = pickDevice(role, list, current[role] || storage.get(storageKey(role)));
        }
        return next;
      });
      setPermissionError(null);
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // Initial device scan; refresh() only sets state after awaiting the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const onChange = () => void refresh(false);
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [refresh]);

  const select = useCallback((role: DeviceRole, deviceId: string) => {
    setSelection((current) => ({ ...current, [role]: deviceId }));
    storage.set(storageKey(role), deviceId);
  }, []);

  const issues = useMemo(() => validateSelection(devices, selection), [devices, selection]);
  const cablesReady = useMemo(() => hasVirtualCables(devices), [devices]);

  return { devices, selection, select, refresh, issues, cablesReady, permissionError };
}
