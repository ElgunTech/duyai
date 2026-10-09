import { memo } from "react";
import { formatSeconds, gradeLatency } from "../../lib/format";
import { isRisky } from "../../lib/scam";
import type { Speaker, TranscriptEntry } from "../../types";
import { Icon } from "../ui/Icon";
import styles from "./Conversation.module.css";
import { tr } from "../../i18n/i18n";

const SPEAKER_LABEL: Record<Speaker, string> = {
  get me() {
    return tr("Mən", "Me");
  },
  get friend() {
    return tr("Qarşı tərəf", "Other party");
  },
  get ai() {
    return tr("AI · sənin adından", "AI · on your behalf");
  },
};

/** One utterance: original text on top, translation below, with timing. */
export const MessageItem = memo(function MessageItem({ entry }: { entry: TranscriptEntry }) {
  const risk = isRisky(entry.risk) ? entry.risk : undefined;
  return (
    <div className={styles.message} data-who={entry.who} data-risk={risk?.level}>
      <div className={styles.meta}>
        <span className={styles.who}>{SPEAKER_LABEL[entry.who]}</span>
        <span>{entry.time}</span>
        {risk && (
          <span className={styles.riskBadge}>
            <Icon name="shield" size={12} />
            {risk.level === "danger"
              ? tr("Fırıldaq riski", "Scam risk")
              : tr("Şübhəli", "Suspicious")}
          </span>
        )}
        {entry.latencyMs !== undefined && (
          <span
            className={styles.latency}
            data-grade={gradeLatency(entry.latencyMs)}
            title={tr("Gecikmə", "Latency")}
          >
            {formatSeconds(entry.latencyMs)}
          </span>
        )}
      </div>
      <div className={styles.bubble}>
        <div className={styles.original}>{entry.original}</div>
        <div className={styles.translation} data-status={entry.status}>
          <span className={styles.lang}>{entry.toLang.toUpperCase()}</span>
          <span>
            {entry.status === "pending" && (
              <span className={styles.typing} aria-label={tr("Tərcümə olunur", "Translating")}>
                <i />
                <i />
                <i />
              </span>
            )}
            {entry.status === "done" && entry.translation}
            {entry.status === "error" && `${tr("Xəta", "Error")}: ${entry.error}`}
          </span>
        </div>
      </div>
      {entry.note && (
        <div className={styles.note} role="note">
          <Icon name="help" size={14} />
          <span>
            <b>{tr("Cavabı sən ver:", "Your answer needed:")}</b> {entry.note}
          </span>
        </div>
      )}
    </div>
  );
});
