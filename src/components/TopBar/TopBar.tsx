import type { Theme } from "../../hooks/useTheme";
import type { CallStatus, Health } from "../../types";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CallTimer } from "./CallTimer";
import styles from "./TopBar.module.css";
import { tr, useUiLang } from "../../i18n/i18n";

interface TopBarProps {
  status: CallStatus;
  statusLabel: string;
  startedAt: number | null;
  health: Health | null;
  /** How the call audio travels: virtual cables (computer mode) or Twilio (phone mode). */
  channel: { label: string; ok: boolean; title: string };
  theme: Theme;
  onToggleTheme: () => void;
  onOpenGuide: () => void;
  onOpenNotes: () => void;
  /** Absent in the public demo (the phone viewer needs the local network). */
  onOpenPhoneView?: () => void;
  onOpenPricing: () => void;
  noteCount: number;
}

type IndicatorState = "pending" | "ok" | "error";

function Indicator({
  label,
  state,
  title,
}: {
  label: string;
  state: IndicatorState;
  title: string;
}) {
  return (
    <span className={styles.indicator} data-state={state} title={title}>
      {label}
    </span>
  );
}

export function TopBar({
  status,
  statusLabel,
  startedAt,
  health,
  channel,
  theme,
  onToggleTheme,
  onOpenGuide,
  onOpenNotes,
  onOpenPhoneView,
  onOpenPricing,
  noteCount,
}: TopBarProps) {
  const { lang, setLang } = useUiLang();
  const providerState = (ok?: boolean): IndicatorState =>
    health ? (ok ? "ok" : "error") : "pending";

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <div className={styles.mark} aria-hidden="true">
          <Icon name="phone" size={15} />
        </div>
        <span className={styles.name}>DuyAI</span>
        <span className={styles.separator} />
        <span className={styles.tagline}>{tr("Zəng tərcüməçisi", "Call interpreter")}</span>
      </div>

      <div className={styles.status} data-status={status} role="status">
        <span className={styles.dot} />
        <span>{statusLabel}</span>
        <CallTimer className={styles.timer} startedAt={status === "live" ? startedAt : null} />
      </div>

      <div className={styles.actions}>
        <div className={styles.indicators}>
          <Indicator
            label="Azure"
            state={providerState(health?.azure.ok)}
            title={
              health?.azure.ok
                ? `Azure Speech · ${health.azure.region}`
                : `Azure: ${health?.azure.error ?? tr("yoxlanılır", "checking")}`
            }
          />
          <Indicator
            label="Claude"
            state={providerState(health?.claude.ok)}
            title={
              health?.claude.ok
                ? tr(
                    `Claude · canlı: ${health.claude.fastModel ?? health.claude.model}, hesabat: ${health.claude.model}`,
                    `Claude · live: ${health.claude.fastModel ?? health.claude.model}, report: ${health.claude.model}`,
                  )
                : `Claude: ${health?.claude.error ?? tr("yoxlanılır", "checking")}`
            }
          />
          {/* The public demo has no call hardware: no red "cables" light there. */}
          {health?.translator?.engine === "azure" && (
            <Indicator
              label={tr("Tərcümə", "Translation")}
              state={providerState(health.translator.ok)}
              title={
                health.translator.ok
                  ? tr(
                      "Canlı tərcümə: Azure Translator (pulsuz, Claude krediti işlənmir)",
                      "Live translation: Azure Translator (free, no Claude credit used)",
                    )
                  : `Azure Translator: ${health.translator.error ?? tr("yoxlanılır", "checking")}`
              }
            />
          )}
          {!health?.demo && (
            <Indicator
              label={channel.label}
              state={channel.ok ? "ok" : "error"}
              title={channel.title}
            />
          )}
        </div>
        <div
          className={styles.langSwitch}
          role="group"
          aria-label={tr("Tətbiqin dili", "App language")}
        >
          {(["en", "az"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <IconButton
          icon="dollar"
          label={tr("Abunəlik planları", "Subscription plans")}
          onClick={onOpenPricing}
        />
        {onOpenPhoneView && (
          <IconButton
            icon="qr"
            label={tr("Telefonda göstər (QR)", "Show on phone (QR)")}
            onClick={onOpenPhoneView}
          />
        )}
        <IconButton
          icon={theme === "dark" ? "moon" : "sun"}
          label={
            theme === "dark"
              ? tr("İşıqlı temaya keç", "Switch to light theme")
              : tr("Tünd temaya keç", "Switch to dark theme")
          }
          onClick={onToggleTheme}
        />
        <Button variant="ghost" icon="square" onClick={onOpenNotes}>
          {tr("Qeydlər", "Notes")}
          {noteCount > 0 && ` (${noteCount})`}
        </Button>
        <Button variant="ghost" icon="help" onClick={onOpenGuide}>
          {tr("Bələdçi", "Guide")}
        </Button>
      </div>
    </header>
  );
}
