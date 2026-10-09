import { useRef } from "react";
import { WAVE_BARS } from "../../config/constants";
import type { LanguageCode } from "../../config/languages";
import { usePartyActivity } from "../../hooks/usePartyActivity";
import type { ClipPlayer, StreamAnalyser } from "../../lib/audio";
import type { PartyState, Side } from "../../types";
import { Icon } from "../ui/Icon";
import styles from "./Stage.module.css";
import { langName, tr } from "../../i18n/i18n";

const STATE_LABEL: Record<PartyState, string> = {
  get off() {
    return tr("Gözləyir", "Waiting");
  },
  get listening() {
    return tr("Dinləyir", "Listening");
  },
  get speaking() {
    return tr("Danışır", "Speaking");
  },
  get ai() {
    return tr("AI danışır", "AI speaking");
  },
};

const BARS = Array.from({ length: WAVE_BARS }, (_, i) => i);

interface PartyCardProps {
  side: Side;
  name: string;
  initial: string;
  lang: LanguageCode;
  analyser: StreamAnalyser | null;
  /** Player that speaks translations to this side. */
  player: ClipPlayer | null;
  partial: string;
  /** Phone mode: state reported by the server instead of measured locally. */
  externalState?: PartyState;
  /** Mute control (my card, during a computer-mode call). */
  mute?: { muted: boolean; onToggle: () => void };
}

export function PartyCard({
  side,
  name,
  initial,
  lang,
  analyser,
  player,
  partial,
  externalState,
  mute,
}: PartyCardProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const measured = usePartyActivity({ analyser, player, waveRef, externalState });
  // Recognized words prove the person is talking, even when the line is too quiet to measure.
  const state = measured === "listening" && partial ? "speaking" : measured;

  return (
    <article
      className={styles.party}
      data-side={side}
      data-state={state}
      data-muted={mute?.muted || undefined}
      aria-label={name}
    >
      <div className={styles.partyTop}>
        <div className={styles.avatar} aria-hidden="true">
          {initial}
        </div>
        <div className={styles.identity}>
          <div className={styles.partyName}>{name}</div>
          <div className={styles.partyLang}>
            <span className={styles.code}>{lang.toUpperCase()}</span>
            {langName(lang)}
          </div>
        </div>
        <div className={styles.state}>
          <i />
          {mute?.muted ? tr("Səssiz", "Muted") : STATE_LABEL[state]}
        </div>
        {mute && (
          <button
            type="button"
            className={styles.mute}
            onClick={mute.onToggle}
            aria-pressed={mute.muted}
            title={
              mute.muted
                ? tr("Mikrofonu aç (M)", "Unmute (M)")
                : tr("Mikrofonu bağla (M)", "Mute (M)")
            }
          >
            <Icon name={mute.muted ? "micOff" : "mic"} size={18} />
            <span className={styles.srOnly}>
              {mute.muted ? tr("Mikrofonu aç", "Unmute") : tr("Mikrofonu bağla", "Mute")}
            </span>
          </button>
        )}
      </div>
      <div className={styles.wave} ref={waveRef} aria-hidden="true">
        {BARS.map((i) => (
          <span key={i} />
        ))}
      </div>
      <p className={styles.partial} aria-live="polite">
        {partial}
      </p>
    </article>
  );
}
