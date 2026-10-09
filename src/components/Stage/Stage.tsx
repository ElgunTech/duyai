import type { LanguageCode } from "../../config/languages";
import type { ClipPlayer, StreamAnalyser } from "../../lib/audio";
import { formatSeconds } from "../../lib/format";
import type { PartyState, Side } from "../../types";
import { PartyCard } from "./PartyCard";
import styles from "./Stage.module.css";
import { tr } from "../../i18n/i18n";

interface StageProps {
  myLang: LanguageCode;
  friendLang: LanguageCode;
  live: boolean;
  analysers: Record<Side, StreamAnalyser> | null;
  players: { toMe: ClipPlayer; toFriend: ClipPlayer } | null;
  partials: Record<Side, string>;
  lastLatency: number | null;
  /** Phone mode: party states from the server. */
  externalStates?: Record<Side, PartyState>;
  /** Mute control for my microphone (computer mode, during a call). */
  mute?: { muted: boolean; onToggle: () => void };
}

/** The two parties of the call, joined by the AI bridge showing the latest latency. */
export function Stage({
  myLang,
  friendLang,
  live,
  analysers,
  players,
  partials,
  lastLatency,
  externalStates,
  mute,
}: StageProps) {
  return (
    <section className={styles.parties}>
      <PartyCard
        side="me"
        name={tr("Mən", "Me")}
        initial="M"
        lang={myLang}
        analyser={analysers?.me ?? null}
        player={players?.toMe ?? null}
        partial={partials.me}
        externalState={externalStates?.me}
        mute={mute}
      />
      <div className={styles.bridge} data-live={live}>
        <span className={styles.bridgeLine} />
        <div className={styles.bridgeCore} title="Son tərcümənin gecikməsi">
          <span className={styles.bridgeLabel}>AI</span>
          <span className={styles.bridgeLatency}>
            {lastLatency ? formatSeconds(lastLatency) : "—"}
          </span>
        </div>
        <span className={styles.bridgeLine} />
      </div>
      <PartyCard
        side="friend"
        name={tr("Qarşı tərəf", "Other party")}
        initial="Q"
        lang={friendLang}
        analyser={analysers?.friend ?? null}
        player={players?.toFriend ?? null}
        partial={partials.friend}
        externalState={externalStates?.friend}
      />
    </section>
  );
}
