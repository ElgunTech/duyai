import { LANGUAGE_CODES, type LanguageCode } from "../../config/languages";
import type { StreamAnalyser } from "../../lib/audio";
import type { AudioDevice } from "../../lib/devices";
import type { AutoDetect, AutoDetectState } from "../../hooks/useCallAutoDetect";
import type { CountryMatch } from "../../lib/phone";
import type {
  CallStatus,
  DeviceIssue,
  DeviceRole,
  DeviceSelection,
  Side,
  VoiceGender,
} from "../../types";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Segmented } from "../ui/Segmented";
import { Select } from "../ui/Select";
import { Toggle } from "../ui/Toggle";
import { DeviceField } from "./DeviceField";
import styles from "./ControlPanel.module.css";
import { langName, tr } from "../../i18n/i18n";

// Labels are getters so they follow the interface language (EN / AZ).
const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((code) => ({
  value: code,
  get label() {
    return langName(code);
  },
}));
const VOICE_OPTIONS: { value: VoiceGender; label: string }[] = [
  {
    value: "f",
    get label() {
      return tr("Qadın", "Female");
    },
  },
  {
    value: "m",
    get label() {
      return tr("Kişi", "Male");
    },
  },
];

const PROFILE_MAX_LENGTH = 4000;
const profilePlaceholder = () =>
  tr(
    "Məs: Adım Əli Məmmədov. 12–15 oktyabr Berlində 2 nəfərlik otaq lazımdır. Büdcə gecəsi 100 avroya qədər. E-poçt: ...",
    "E.g.: My name is Ali Mammadov. I need a double room in Berlin, 12–15 October. Budget up to 100 euros a night. E-mail: ...",
  );

export type LanguageMode = "auto" | "manual";

const LANG_MODE_OPTIONS: { value: LanguageMode; label: string }[] = [
  {
    value: "auto",
    get label() {
      return tr("Avtomatik", "Automatic");
    },
  },
  {
    value: "manual",
    get label() {
      return tr("Manual", "Manual");
    },
  },
];

/** The hint under the mode switch: what was detected from the number, or what to do. */
function describeDetection(settings: PanelSettings, detected: CountryMatch | null) {
  if (settings.langMode === "manual") {
    return {
      detectState: "manual",
      detectMessage: tr("Dil əl ilə seçilir", "Language chosen by hand"),
    };
  }
  if (!settings.phoneNumber.trim()) {
    return {
      detectState: "idle",
      detectMessage: tr(
        "Nömrəni yazın, dil ölkə koduna görə seçiləcək",
        "Type the number: the language is picked from the country code",
      ),
    };
  }
  if (!detected) {
    return {
      detectState: "unknown",
      detectMessage: tr(
        "Ölkə tanınmadı və ya dili dəstəklənmir. Dili əl ilə seçin",
        "Country not recognized or language not supported. Choose the language by hand",
      ),
    };
  }
  const lang = langName(detected.lang);
  if (detected.lang === settings.myLang) {
    return {
      detectState: "same",
      detectMessage: tr(
        `${detected.country} (+${detected.code}): qarşı tərəf də ${lang.toLowerCase()} danışır`,
        `+${detected.code}: the other party also speaks ${lang}`,
      ),
    };
  }
  return {
    detectState: "ok",
    detectMessage: tr(
      `${detected.country} (+${detected.code}) → ${lang}`,
      `+${detected.code} → ${lang}`,
    ),
  };
}

export type CallMode = "computer" | "phone";

const CALL_MODE_OPTIONS: { value: CallMode; label: string }[] = [
  {
    value: "computer",
    get label() {
      return tr("Kompüter", "Computer");
    },
  },
  {
    value: "phone",
    get label() {
      return tr("Telefon", "Phone");
    },
  },
];

const AUTO_DETECT_TEXT: Record<AutoDetectState, string> = {
  get off() {
    return tr("Zəng gözlənilir", "Waiting for a call");
  },
  get armed() {
    return tr(
      "Hazırdır: telefonda zəng başlayanda tərcümə özü başlayacaq",
      "Ready: translation starts by itself when a phone call starts",
    );
  },
  get "needs-click"() {
    return tr(
      "Aktivləşdirmək üçün səhifənin istənilən yerinə bir dəfə klikləyin",
      "Click anywhere on the page once to activate",
    );
  },
  get error() {
    return tr(
      "Zəng kabelini dinləmək alınmadı. Cihaz seçimini yoxlayın",
      "Could not listen to the call cable. Check the device selection",
    );
  },
};

function ctaLabel(status: CallStatus, phoneMode: boolean): string {
  if (status === "live") return tr("Zəngi bitir", "End call");
  if (status === "connecting")
    return phoneMode ? tr("Ləğv et", "Cancel") : tr("Qoşulur…", "Connecting…");
  return phoneMode ? tr("Zəng et", "Call") : tr("Tərcüməni başlat", "Start translation");
}

export interface PanelSettings {
  /** Computer: Phone Link + virtual cables. Phone: both parties on GSM via Twilio. */
  callMode: CallMode;
  /** My own number, called first in phone mode. */
  myNumber: string;
  /** The other party's number; its calling code picks their language in auto mode. */
  phoneNumber: string;
  langMode: LanguageMode;
  myLang: LanguageCode;
  /** Effective language of the other party (auto-detected or chosen). */
  friendLang: LanguageCode;
  voice: VoiceGender;
  echoGuard: boolean;
  monitorOriginal: boolean;
  autoAnswer: boolean;
  profile: string;
  /** Computer mode: start/stop the translation by itself when a phone call begins/ends. */
  autoStart: boolean;
}

interface ControlPanelProps {
  settings: PanelSettings;
  /** Country recognized from the phone number, if any. */
  detected: CountryMatch | null;
  onSettingsChange: <K extends keyof PanelSettings>(key: K, value: PanelSettings[K]) => void;
  onSwapLanguages: () => void;
  devices: AudioDevice[];
  selection: DeviceSelection;
  onSelectDevice: (role: DeviceRole, deviceId: string) => void;
  onRefreshDevices: () => void;
  issues: DeviceIssue[];
  analysers: Record<Side, StreamAnalyser> | null;
  status: CallStatus;
  /** Progress text while a phone call is being set up. */
  phase: string | null;
  /** Phone mode availability (Twilio keys + tunnel). */
  phoneReady: boolean | null;
  /** State of the automatic call detection (computer mode). */
  autoDetect: AutoDetect;
  onToggleCall: () => void;
}

export function ControlPanel({
  settings,
  detected,
  onSettingsChange,
  onSwapLanguages,
  devices,
  selection,
  onSelectDevice,
  onRefreshDevices,
  issues,
  analysers,
  status,
  phase,
  phoneReady,
  autoDetect,
  onToggleCall,
}: ControlPanelProps) {
  const locked = status === "live" || status === "connecting";
  const phoneMode = settings.callMode === "phone";

  const autoApplied = settings.langMode === "auto" && detected !== null;
  const { detectState, detectMessage } = describeDetection(settings, detected);

  const deviceProps = (role: DeviceRole) => ({
    devices,
    value: selection[role],
    onChange: (id: string) => onSelectDevice(role, id),
    disabled: locked,
  });

  return (
    <aside className={styles.panel} aria-label={tr("Zəng ayarları", "Call settings")}>
      <div className={styles.scroll}>
        <section className={styles.block}>
          <h3 className={styles.title}>{tr("Zəng rejimi", "Call mode")}</h3>
          <Segmented
            label={tr("Zəng rejimi", "Call mode")}
            value={settings.callMode}
            options={CALL_MODE_OPTIONS}
            onChange={(v) => onSettingsChange("callMode", v)}
            disabled={locked}
          />
          <p className={styles.modeHint}>
            {phoneMode
              ? phoneReady === false
                ? tr(
                    "Telefon rejimi hazır deyil: .env faylında Twilio açarları və ya internet tuneli yoxdur",
                    "Phone mode is not ready: Twilio keys or the internet tunnel are missing in .env",
                  )
                : tr(
                    "Hər iki tərəf adi telefonda danışır. Əvvəl sizə, sonra qarşı tərəfə zəng gəlir.",
                    "Both sides talk on ordinary phones. You are called first, then the other party.",
                  )
              : tr(
                  "Zəngi Telefon Bağlantısından edirsiniz, səs kompüterdən keçir.",
                  "You call through Phone Link; the audio passes through this computer.",
                )}
          </p>
          {phoneMode && (
            <label className={styles.field}>
              <span className={styles.label}>{tr("Mənim nömrəm", "My number")}</span>
              <input
                type="tel"
                className={styles.input}
                value={settings.myNumber}
                onChange={(e) => onSettingsChange("myNumber", e.target.value)}
                placeholder="+994 50 123 45 67"
                autoComplete="tel"
                disabled={locked}
              />
            </label>
          )}
        </section>

        <section className={styles.block}>
          <h3 className={styles.title}>{tr("Dillər", "Languages")}</h3>
          <label className={styles.field}>
            <span className={styles.label}>
              {tr("Qarşı tərəfin nömrəsi", "Other party's number")}
            </span>
            <input
              type="tel"
              className={styles.input}
              value={settings.phoneNumber}
              onChange={(e) => onSettingsChange("phoneNumber", e.target.value)}
              placeholder="+49 30 1234567"
              autoComplete="off"
              disabled={locked}
            />
          </label>
          <div className={styles.modeRow}>
            <Segmented
              label={tr(
                "Qarşı tərəfin dilini seçmə üsulu",
                "How the other party's language is chosen",
              )}
              value={settings.langMode}
              options={LANG_MODE_OPTIONS}
              onChange={(v) => onSettingsChange("langMode", v)}
              disabled={locked}
            />
            <p className={styles.detect} data-state={detectState}>
              {detectMessage}
            </p>
          </div>
          <div className={styles.langPair}>
            <label className={styles.field}>
              <span className={styles.label}>{tr("Mən", "Me")}</span>
              <Select
                value={settings.myLang}
                options={LANGUAGE_OPTIONS}
                onChange={(v) => onSettingsChange("myLang", v as LanguageCode)}
                disabled={locked}
              />
            </label>
            <IconButton
              icon="swap"
              label={tr("Dilləri dəyiş", "Swap languages")}
              bordered
              onClick={onSwapLanguages}
              disabled={locked}
            />
            <label className={styles.field}>
              <span className={styles.label}>{tr("Qarşı tərəf", "Other party")}</span>
              <Select
                value={settings.friendLang}
                options={LANGUAGE_OPTIONS}
                onChange={(v) => onSettingsChange("friendLang", v as LanguageCode)}
                disabled={locked}
                title={
                  autoApplied
                    ? tr(
                        "Nömrəyə görə seçildi. Dəyişsəniz, manual rejimə keçir.",
                        "Picked from the number. Changing it switches to manual mode.",
                      )
                    : undefined
                }
              />
            </label>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{tr("AI səsi", "AI voice")}</span>
            <Segmented
              label={tr("AI səsi", "AI voice")}
              value={settings.voice}
              options={VOICE_OPTIONS}
              onChange={(v) => onSettingsChange("voice", v)}
              disabled={locked}
            />
          </div>
        </section>

        {!phoneMode && (
          <section className={styles.block}>
            <h3 className={styles.title}>
              {tr("Səs cihazları", "Audio devices")}
              <button
                type="button"
                className={styles.link}
                onClick={onRefreshDevices}
                disabled={locked}
              >
                <Icon name="refresh" size={13} />
                {tr("Yenilə", "Refresh")}
              </button>
            </h3>
            <DeviceField
              label={tr("Mikrofonum", "My microphone")}
              icon="mic"
              kind="audioinput"
              liveAnalyser={analysers?.me}
              {...deviceProps("myMic")}
            />
            <DeviceField
              label={tr("Qulaqlığım", "My headphones")}
              icon="headphones"
              kind="audiooutput"
              {...deviceProps("myOut")}
            />
            <DeviceField
              label={tr("Zəngdən gələn", "Call in")}
              icon="arrowIn"
              hint="CABLE Output"
              kind="audioinput"
              isCallAudio
              liveAnalyser={analysers?.friend}
              {...deviceProps("callIn")}
            />
            <DeviceField
              label={tr("Zəngə gedən", "Call out")}
              icon="arrowOut"
              hint="Voicemeeter Input"
              kind="audiooutput"
              {...deviceProps("callOut")}
            />
            {issues.length > 0 && (
              <ul className={styles.issues}>
                {issues.map((issue) => (
                  <li key={issue.message} data-level={issue.level}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className={styles.block}>
          <h3 className={styles.title}>{tr("AI cavablayıcı", "AI auto-answer")}</h3>
          <Toggle
            label={tr("Suallara özü cavab versin", "Answer questions for me")}
            description={tr(
              "Qarşı tərəfin suallarını sənin adından cavablayır",
              "Answers the other party's questions on your behalf",
            )}
            checked={settings.autoAnswer}
            onChange={(v) => onSettingsChange("autoAnswer", v)}
          />
          <label className={styles.profile}>
            <span className={styles.label}>
              {tr(
                "Mənim haqqımda (AI yalnız bunu istifadə edir)",
                "About me (the AI uses only this)",
              )}
            </span>
            <textarea
              className={styles.textarea}
              value={settings.profile}
              onChange={(e) => onSettingsChange("profile", e.target.value)}
              maxLength={PROFILE_MAX_LENGTH}
              rows={4}
              placeholder={profilePlaceholder()}
              disabled={!settings.autoAnswer}
            />
            <span className={styles.counter}>
              {settings.profile.length}/{PROFILE_MAX_LENGTH}
            </span>
          </label>
        </section>

        {!phoneMode && (
          <section className={styles.block}>
            <h3 className={styles.title}>{tr("Seçimlər", "Options")}</h3>
            <Toggle
              label={tr("Avtomatik başlat", "Auto start")}
              description={tr(
                "Telefonda zəng başlayanda tərcümə özü başlayır, bitəndə dayanır",
                "Starts when a phone call starts and stops when it ends",
              )}
              checked={settings.autoStart}
              onChange={(v) => onSettingsChange("autoStart", v)}
            />
            {settings.autoStart && !locked && (
              <p className={styles.autoState} data-state={autoDetect.state}>
                {AUTO_DETECT_TEXT[autoDetect.state]}
                {autoDetect.state === "armed" && autoDetect.source === "audio" && (
                  <span
                    className={styles.lineLevel}
                    title={tr(
                      "Zəng xəttinin səs səviyyəsi / boş xəttin fon səviyyəsi",
                      "Call line level / idle line noise level",
                    )}
                  >
                    {(autoDetect.level * 1000).toFixed(1)} /{" "}
                    {(autoDetect.idleLevel * 1000).toFixed(1)}
                  </span>
                )}
              </p>
            )}
            <Toggle
              label={tr("Exo qoruması", "Echo guard")}
              description={tr(
                "AI danışarkən gələn səsi nəzərə almır",
                "Ignores input while the AI is speaking",
              )}
              checked={settings.echoGuard}
              onChange={(v) => onSettingsChange("echoGuard", v)}
            />
            <Toggle
              label={tr("Orijinal səs", "Original voice")}
              description={tr(
                "Qarşı tərəfin öz səsini zəif eşit",
                "Hear the other party's own voice quietly",
              )}
              checked={settings.monitorOriginal}
              onChange={(v) => onSettingsChange("monitorOriginal", v)}
              disabled={locked}
            />
          </section>
        )}
      </div>

      <div className={styles.foot}>
        <button
          type="button"
          className={styles.cta}
          data-state={status}
          onClick={onToggleCall}
          // A phone call can be cancelled while it is still ringing.
          disabled={status === "connecting" && !phoneMode}
        >
          <Icon name="phone" />
          {ctaLabel(status, phoneMode)}
        </button>
        <p className={styles.hint}>
          {phoneMode
            ? (phase ??
              tr(
                "Nömrələri yazın və «Zəng et» düyməsinə basın",
                "Type both numbers and press “Call”",
              ))
            : tr("Əvvəlcə Telefon Bağlantısından zəng edin", "First place a call in Phone Link")}
        </p>
      </div>
    </aside>
  );
}
