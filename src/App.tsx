import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ControlPanel,
  type CallMode,
  type LanguageMode,
  type PanelSettings,
} from "./components/ControlPanel/ControlPanel";
import { Conversation } from "./components/Conversation/Conversation";
import { DemoLimits } from "./components/DemoLimits/DemoLimits";
import { DemoPanel } from "./components/DemoPanel/DemoPanel";
import { GuideModal } from "./components/GuideModal/GuideModal";
import { LiveInsights } from "./components/LiveInsights/LiveInsights";
import { NotesModal } from "./components/NotesModal/NotesModal";
import { PhoneViewModal } from "./components/PhoneViewModal/PhoneViewModal";
import { PricingModal } from "./components/PricingModal/PricingModal";
import { ScamAlertBanner } from "./components/ScamAlert/ScamAlertBanner";
import { SponsorStrip } from "./components/SponsorStrip/SponsorStrip";
import { Stage } from "./components/Stage/Stage";
import { SummaryModal } from "./components/SummaryModal/SummaryModal";
import { TopBar } from "./components/TopBar/TopBar";
import { isLanguageCode, LANGUAGES, type LanguageCode } from "./config/languages";
import { useToast } from "./context/toastContext";
import { useAudioDevices } from "./hooks/useAudioDevices";
import {
  useCallAutoEnd,
  useCallAutoStart,
  useWindowsCallState,
  type AutoDetect,
} from "./hooks/useCallAutoDetect";
import { useCallReport } from "./hooks/useCallReport";
import { useCallSession, type FinishedCall } from "./hooks/useCallSession";
import { useHealth } from "./hooks/useHealth";
import { useLiveInsights } from "./hooks/useLiveInsights";
import { useNotes } from "./hooks/useNotes";
import { parseBoolean, usePersistentState } from "./hooks/usePersistentState";
import { usePhoneCall } from "./hooks/usePhoneCall";
import { useTheme } from "./hooks/useTheme";
import { useViewerSync } from "./hooks/useViewerSync";
import { detectCountry, internationalDigits } from "./lib/phone";
import { storage } from "./lib/storage";
import type { CallStatus, ViewerSnapshot, VoiceGender } from "./types";
import styles from "./App.module.css";
import { tr, useUiLang } from "./i18n/i18n";

const parseLanguage = (raw: string): LanguageCode | null => (isLanguageCode(raw) ? raw : null);
const parseVoice = (raw: string): VoiceGender | null => (raw === "f" || raw === "m" ? raw : null);
const parseCallMode = (raw: string): CallMode | null =>
  raw === "computer" || raw === "phone" ? raw : null;

/** "+994 50 123 45 67" / "050..." → "+994501234567" */
const toE164 = (input: string) => `+${internationalDigits(input)}`;

function statusLabel(
  status: CallStatus,
  myLang: LanguageCode,
  friendLang: LanguageCode,
  phase: string | null,
): string {
  switch (status) {
    case "connecting":
      return phase ?? tr("Qoşulur…", "Connecting…");
    case "live":
      return `${tr("Canlı", "Live")} · ${myLang.toUpperCase()} – ${friendLang.toUpperCase()}`;
    case "ended":
      return tr("Zəng bitdi", "Call ended");
    case "error":
      return tr("Xəta", "Error");
    default:
      return tr("Hazır", "Ready");
  }
}

/** True once the user has clicked or typed on the page (browsers block audio before that). */
function useUserActivation(): boolean {
  const [active, setActive] = useState(() => navigator.userActivation?.hasBeenActive ?? false);
  useEffect(() => {
    if (active) return;
    const activate = () => setActive(true);
    document.addEventListener("pointerdown", activate, { once: true });
    document.addEventListener("keydown", activate, { once: true });
    return () => {
      document.removeEventListener("pointerdown", activate);
      document.removeEventListener("keydown", activate);
    };
  }, [active]);
  return active;
}

export default function App() {
  const notify = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  useUiLang(); // re-render everything when the interface language changes
  const health = useHealth();
  /** Public cloud demo: no call hardware; the visitor plays the other party by typing. */
  const demo = Boolean(health?.demo);
  const audio = useAudioDevices();

  // ---------- settings ----------
  const [callMode, setCallMode] = usePersistentState<CallMode>(
    "callMode",
    "computer",
    parseCallMode,
  );
  const [myNumber, setMyNumber] = usePersistentState("myNumber", "", (raw) => raw);
  const [myLang, setMyLang] = usePersistentState<LanguageCode>("myLang", "az", parseLanguage);
  const [manualFriendLang, setManualFriendLang] = usePersistentState<LanguageCode>(
    "friendLang",
    "de",
    parseLanguage,
  );
  const [langMode, setLangMode] = usePersistentState<LanguageMode>("langMode", "auto", (raw) =>
    raw === "auto" || raw === "manual" ? raw : null,
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const detected = useMemo(() => detectCountry(phoneNumber), [phoneNumber]);
  // In auto mode the calling code decides; until a country is recognized, the last manual choice applies.
  const friendLang = langMode === "auto" && detected ? detected.lang : manualFriendLang;
  const [voice, setVoice] = usePersistentState<VoiceGender>("voice", "f", parseVoice);
  const [echoGuard, setEchoGuard] = usePersistentState("echoGuard", true, parseBoolean);
  const [monitorOriginal, setMonitorOriginal] = usePersistentState(
    "monitorOriginal",
    false,
    parseBoolean,
  );
  const [autoAnswer, setAutoAnswer] = usePersistentState("autoAnswer", false, parseBoolean);
  const [profile, setProfile] = usePersistentState("profile", "", (raw) => raw);
  const [autoStart, setAutoStart] = usePersistentState("autoStart", true, parseBoolean);
  const [guideOpen, setGuideOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [phoneViewOpen, setPhoneViewOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const { notes } = useNotes();

  // ---------- calls ----------
  // Options the call reads live, so they can be changed mid-call.
  const liveOptions = useMemo(
    () => ({ echoGuard, autoAnswer, profile }),
    [echoGuard, autoAnswer, profile],
  );
  const { report, generate: generateReport, close: closeReport } = useCallReport();

  // Languages of the call in progress, for its report.
  const callLangsRef = useRef({ myLang, friendLang });
  /** The other party's number for the call memory, captured when the call starts. */
  const callNumberRef = useRef("");
  const finishCall = useCallback(
    (finished: FinishedCall) => {
      const { myLang: mine, friendLang: chosen } = callLangsRef.current;
      const theirs = finished.friendLang ?? chosen; // the language actually detected
      const number = callNumberRef.current || undefined;
      if (finished.transcript.length) void generateReport(finished, mine, theirs, number);
      else
        notify(
          tr(
            "Danışıq olmadı, hesabat üçün məlumat yoxdur.",
            "Nothing was said, so there is no report.",
          ),
        );
    },
    [generateReport, notify],
  );

  const computerCall = useCallSession(notify, liveOptions);
  const phoneCall = usePhoneCall(notify, liveOptions, finishCall);
  const phoneMode = callMode === "phone" && !demo;
  const call = phoneMode ? phoneCall : computerCall;
  const phase = phoneMode ? phoneCall.phase : null;
  const live = useLiveInsights(call.transcript, call.isLive, myLang);
  const canMute = !phoneMode && computerCall.isLive;
  const { toggleMute } = computerCall;

  // "M" mutes/unmutes my microphone during a call (not while typing in a field).
  useEffect(() => {
    if (!canMute) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable]");
      if (typing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "m" || event.key === "M") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canMute, toggleMute]);
  // During a computer-mode call the other party's language follows what Azure detects.
  const shownFriendLang = (!phoneMode && computerCall.activeFriendLang) || friendLang;

  // Phones watching through the QR link get the same live view.
  const viewerSnapshot: ViewerSnapshot = {
    status: call.status,
    myLang: { code: myLang, name: LANGUAGES[myLang].name },
    friendLang: { code: shownFriendLang, name: LANGUAGES[shownFriendLang].name },
    muted: !phoneMode && computerCall.muted,
    entries: call.transcript.slice(-60).map(({ id, who, time, original, translation, status }) => ({
      id,
      who,
      time,
      original,
      translation,
      status,
    })),
    partials: call.partials,
    alerts: call.alerts.map((a) => ({
      id: a.id,
      level: a.level,
      reason: a.reason,
      quote: a.quote,
    })),
    summary: report?.summary
      ? { title: report.summary.title, summary: report.summary.summary }
      : null,
  };
  useViewerSync(viewerSnapshot);

  const settings: PanelSettings = {
    callMode,
    myNumber,
    phoneNumber,
    langMode,
    myLang,
    friendLang,
    voice,
    echoGuard,
    monitorOriginal,
    autoAnswer,
    profile,
    autoStart,
  };

  const updateSetting = <K extends keyof PanelSettings>(key: K, value: PanelSettings[K]) => {
    const setters: { [P in keyof PanelSettings]: (v: PanelSettings[P]) => void } = {
      callMode: setCallMode,
      myNumber: setMyNumber,
      phoneNumber: setPhoneNumber,
      langMode: setLangMode,
      myLang: setMyLang,
      // Picking a language by hand switches auto-detection off.
      friendLang: (lang) => {
        setManualFriendLang(lang);
        setLangMode("manual");
      },
      voice: setVoice,
      echoGuard: setEchoGuard,
      monitorOriginal: setMonitorOriginal,
      autoAnswer: setAutoAnswer,
      profile: setProfile,
      autoStart: setAutoStart,
    };
    setters[key](value);
  };

  const swapLanguages = () => {
    setMyLang(friendLang);
    setManualFriendLang(myLang);
    setLangMode("manual");
  };

  // First visit in computer mode without virtual cables: show the setup guide once.
  useEffect(() => {
    if (!phoneMode && audio.devices.length && !audio.cablesReady && !storage.get("guideSeen")) {
      storage.set("guideSeen", "1");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuideOpen(true);
    }
  }, [phoneMode, audio.devices.length, audio.cablesReady]);

  useEffect(() => {
    if (audio.permissionError && !phoneMode) {
      notify(
        `${tr("Mikrofona icazə verin", "Allow microphone access")}: ${audio.permissionError}`,
        "error",
      );
    }
  }, [audio.permissionError, phoneMode, notify]);

  /** Starts or ends the call; `auto` = started by call detection while the phone still rings. */
  const toggleCall = useCallback(
    async (auto = false) => {
      if (phoneMode) {
        if (phoneCall.isBusy) return phoneCall.stop(); // the report follows the "ended" event
        if (!detectCountry(myNumber))
          return notify(
            tr("Öz nömrənizi +994... formatında yazın", "Type your own number as +994..."),
            "error",
          );
        if (!detectCountry(phoneNumber)) {
          return notify(
            tr(
              "Qarşı tərəfin nömrəsini beynəlxalq formatda yazın",
              "Type the other party's number in international format",
            ),
            "error",
          );
        }
      } else if (computerCall.isLive) {
        finishCall(await computerCall.stop());
        return;
      }

      if (myLang === friendLang)
        return notify(
          tr("Dillər fərqli olmalıdır", "The two languages must be different"),
          "error",
        );
      callLangsRef.current = { myLang, friendLang };
      callNumberRef.current = detectCountry(phoneNumber) ? toE164(phoneNumber) : "";

      if (phoneMode) {
        void phoneCall.start({
          myNumber: toE164(myNumber),
          friendNumber: toE164(phoneNumber),
          myLang,
          friendLang,
          voice,
        });
        return;
      }
      const blocking = audio.issues.find((issue) => issue.level === "error");
      if (blocking && !demo) return notify(blocking.message, "error");
      void computerCall.start({
        myLang,
        friendLang,
        voice,
        // Demo: only the visitor's microphone; the AI voice plays on their speakers.
        devices: demo
          ? { ...audio.selection, callIn: "", callOut: audio.selection.myOut || "default" }
          : audio.selection,
        monitorOriginal,
        waitForAnswer: auto,
      });
    },
    [
      demo,
      phoneMode,
      phoneCall,
      computerCall,
      myNumber,
      phoneNumber,
      myLang,
      friendLang,
      voice,
      monitorOriginal,
      audio.issues,
      audio.selection,
      finishCall,
      notify,
    ],
  );

  // ---------- automatic start/stop (computer mode) ----------
  // Preferred: the exact Windows call state. Fallback: audio levels on the call cable.
  const autoEnabled = !phoneMode && autoStart;
  const computerBusy = computerCall.status === "live" || computerCall.status === "connecting";
  const windowsCall = useWindowsCallState(autoEnabled);
  const useWindowsSignal = Boolean(windowsCall?.supported);
  const activated = useUserActivation();

  const autoStartCall = useCallback(() => {
    const blocking = audio.issues.find((issue) => issue.level === "error");
    if (blocking) {
      return notify(
        `${tr("Zəng aşkarlandı, amma başlamaq olmur", "Call detected, but cannot start")}: ${blocking.message}`,
        "error",
      );
    }
    notify(tr("Zəng aşkarlandı, tərcümə başladı", "Call detected, translation started"), "success");
    void toggleCall(true);
  }, [audio.issues, notify, toggleCall]);

  const autoEndCall = useCallback(() => {
    notify(tr("Zəng bitdi", "Call ended"));
    void computerCall.stop().then(finishCall);
  }, [computerCall, finishCall, notify]);

  // React to the edges of the Windows call state. The first reading is only remembered,
  // so opening the page in the middle of a call does not start anything.
  const wasInCallRef = useRef<boolean | null>(null);
  const inCall = windowsCall?.inCall;
  useEffect(() => {
    if (!useWindowsSignal || inCall === undefined) return;
    const wasInCall = wasInCallRef.current;
    wasInCallRef.current = inCall;
    if (wasInCall === null) return;
    if (!wasInCall && inCall && !computerBusy) autoStartCall();
    if (wasInCall && !inCall && computerCall.isLive) autoEndCall();
  }, [useWindowsSignal, inCall, computerBusy, computerCall.isLive, autoStartCall, autoEndCall]);

  const [callIdleLevel, setCallIdleLevel] = useState(0);
  const audioDetect = useCallAutoStart({
    enabled: autoEnabled && !useWindowsSignal && !computerBusy,
    deviceId: audio.selection.callIn,
    onCallStart: (idleLevel) => {
      setCallIdleLevel(idleLevel);
      autoStartCall();
    },
  });
  useCallAutoEnd({
    enabled: autoEnabled && !useWindowsSignal && computerCall.isLive,
    analyser: computerCall.analysers?.friend ?? null,
    idleLevel: callIdleLevel,
    onCallEnd: autoEndCall,
  });

  const autoDetect: AutoDetect = useWindowsSignal
    ? { state: activated ? "armed" : "needs-click", level: 0, idleLevel: 0, source: "windows" }
    : audioDetect;

  const channel = phoneMode
    ? {
        label: "Twilio",
        ok: Boolean(phoneCall.phoneStatus?.ready),
        title: phoneCall.phoneStatus?.ready
          ? `${tr("Telefon rejimi hazırdır", "Phone mode ready")} · ${phoneCall.phoneStatus.number}`
          : phoneCall.phoneStatus?.configured
            ? tr("İnternet tuneli açılır…", "Opening the internet tunnel…")
            : tr("Twilio açarları .env faylında yoxdur", "Twilio keys are missing in .env"),
      }
    : {
        label: tr("Kabel", "Cables"),
        ok: audio.cablesReady,
        title: audio.cablesReady
          ? tr("Virtual kabellər hazırdır", "Virtual cables ready")
          : tr("Virtual kabel tapılmadı", "No virtual cable found"),
      };

  return (
    <div className={styles.app}>
      <TopBar
        status={call.status}
        statusLabel={statusLabel(call.status, myLang, shownFriendLang, phase)}
        startedAt={call.startedAt}
        health={health}
        channel={channel}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenNotes={() => setNotesOpen(true)}
        onOpenPhoneView={() => setPhoneViewOpen(true)}
        onOpenPricing={() => setPricingOpen(true)}
        noteCount={notes.length}
      />

      <div className={styles.layout}>
        <ControlPanel
          settings={settings}
          detected={detected}
          onSettingsChange={updateSetting}
          onSwapLanguages={swapLanguages}
          devices={audio.devices}
          selection={audio.selection}
          onSelectDevice={audio.select}
          onRefreshDevices={() =>
            void audio
              .refresh()
              .then(() => notify(tr("Cihazlar yeniləndi", "Devices refreshed"), "success"))
          }
          issues={audio.issues}
          analysers={computerCall.analysers}
          status={call.status}
          phase={phase}
          phoneReady={phoneCall.phoneStatus ? phoneCall.phoneStatus.ready : null}
          autoDetect={autoDetect}
          onToggleCall={() => void toggleCall()}
        />

        <main className={styles.stage}>
          <ScamAlertBanner alerts={call.alerts} onDismiss={call.dismissAlert} />
          <Stage
            myLang={myLang}
            friendLang={shownFriendLang}
            live={call.isLive}
            analysers={phoneMode ? null : computerCall.analysers}
            players={phoneMode ? null : computerCall.players}
            partials={call.partials}
            lastLatency={call.lastLatency}
            externalStates={phoneMode ? phoneCall.partyStates : undefined}
            mute={canMute ? { muted: computerCall.muted, onToggle: toggleMute } : undefined}
          />
          <LiveInsights insights={live.insights} updating={live.updating} live={call.isLive} />
          {demo && (
            <DemoPanel
              live={computerCall.isLive}
              friendLang={friendLang}
              onSay={computerCall.simulateFriend}
            />
          )}
          <Conversation
            entries={call.transcript}
            live={call.isLive}
            awaitingAnswer={!phoneMode && computerCall.awaitingAnswer}
            onMarkAnswered={computerCall.markAnswered}
          />
          <SponsorStrip />
          {demo && <DemoLimits />}
        </main>
      </div>

      {report && <SummaryModal report={report} onClose={closeReport} />}
      {notesOpen && <NotesModal onClose={() => setNotesOpen(false)} />}
      {phoneViewOpen && <PhoneViewModal onClose={() => setPhoneViewOpen(false)} />}
      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
      {guideOpen && (
        <GuideModal
          cablesReady={audio.cablesReady}
          keysReady={health ? health.azure.ok && health.claude.ok : undefined}
          devicesReady={audio.cablesReady && !audio.issues.some((i) => i.level === "error")}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </div>
  );
}
