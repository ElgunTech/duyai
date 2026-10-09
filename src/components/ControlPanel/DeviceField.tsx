import { useEffect, useRef, useState } from "react";
import { useToast } from "../../context/toastContext";
import { useLevelMeter } from "../../hooks/useLevelMeter";
import {
  StreamAnalyser,
  createTestTone,
  openInputStream,
  playClip,
  stopStream,
} from "../../lib/audio";
import { displayLabel, type AudioDevice } from "../../lib/devices";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { Select } from "../ui/Select";
import styles from "./ControlPanel.module.css";
import { tr } from "../../i18n/i18n";

const INPUT_TEST_MS = 6000;

interface DeviceFieldProps {
  label: string;
  icon: IconName;
  /** Expected device name, shown as a hint for the call paths. */
  hint?: string;
  kind: MediaDeviceKind;
  devices: AudioDevice[];
  value: string;
  onChange: (deviceId: string) => void;
  /** Live analyser during a call, drives the level meter (inputs only). */
  liveAnalyser?: StreamAnalyser | null;
  isCallAudio?: boolean;
  disabled?: boolean;
}

export function DeviceField({
  label,
  icon,
  hint,
  kind,
  devices,
  value,
  onChange,
  liveAnalyser = null,
  isCallAudio = false,
  disabled,
}: DeviceFieldProps) {
  const notify = useToast();
  const meterRef = useRef<HTMLElement>(null);
  const [testAnalyser, setTestAnalyser] = useState<StreamAnalyser | null>(null);
  const [testing, setTesting] = useState(false);
  const isInput = kind === "audioinput";

  useLevelMeter(testAnalyser ?? liveAnalyser, meterRef);

  // Stop an input test if the field unmounts.
  useEffect(() => () => testAnalyser?.dispose(), [testAnalyser]);

  const options = devices
    .filter((d) => d.kind === kind)
    .map((d) => ({ value: d.deviceId, label: displayLabel(d) }));

  async function runTest() {
    setTesting(true);
    try {
      if (!isInput) {
        await playClip(createTestTone(), value, "audio/wav");
        return;
      }
      const stream = await openInputStream(value, isCallAudio);
      const analyser = new StreamAnalyser(stream);
      setTestAnalyser(analyser);
      await new Promise((resolve) => setTimeout(resolve, INPUT_TEST_MS));
      setTestAnalyser(null);
      stopStream(stream);
    } catch (err) {
      notify(
        `${tr("Test alınmadı", "Test failed")}: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={styles.device}>
      <div className={styles.deviceHead}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
      <div className={styles.deviceRow}>
        <Select
          aria-label={label}
          value={value}
          options={options}
          onChange={onChange}
          disabled={disabled}
        />
        <Button
          size="sm"
          onClick={runTest}
          disabled={disabled || testing || !value}
          active={testing}
        >
          {testing && isInput ? tr("Dinləyir…", "Listening…") : "Test"}
        </Button>
      </div>
      {isInput && (
        <div className={styles.meter} aria-hidden="true">
          <i ref={meterRef} />
        </div>
      )}
    </div>
  );
}
