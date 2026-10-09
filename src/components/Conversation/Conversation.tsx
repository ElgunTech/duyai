import { useLayoutEffect, useRef } from "react";
import type { TranscriptEntry } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { MessageItem } from "./MessageItem";
import styles from "./Conversation.module.css";
import { tr } from "../../i18n/i18n";

const STICK_TO_BOTTOM_PX = 120;

interface ConversationProps {
  entries: TranscriptEntry[];
  live: boolean;
  /** Auto-started call that is still ringing: my speech is held back. */
  awaitingAnswer?: boolean;
  onMarkAnswered?: () => void;
}

export function Conversation({ entries, live, awaitingAnswer, onMarkAnswered }: ConversationProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // Follow new messages unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && nearBottomRef.current) body.scrollTop = body.scrollHeight;
  }, [entries]);

  const onScroll = () => {
    const body = bodyRef.current;
    if (body)
      nearBottomRef.current =
        body.scrollHeight - body.scrollTop - body.clientHeight < STICK_TO_BOTTOM_PX;
  };

  return (
    <section className={styles.conversation} aria-label={tr("Danışıq", "Conversation")}>
      <header className={styles.head}>
        <h2>{tr("Danışıq", "Conversation")}</h2>
        <span className={styles.count}>{entries.length} replika</span>
      </header>
      <div className={styles.body} ref={bodyRef} onScroll={onScroll} role="log" aria-live="polite">
        {awaitingAnswer && entries.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Icon name="phone" size={20} />
            </div>
            <div className={styles.emptyTitle}>
              {tr("Qarşı tərəfin cavabı gözlənilir", "Waiting for the other party to answer")}
            </div>
            <p className={styles.emptyText}>
              {tr(
                "Zəng çalır. O «alo» deyən kimi tərcümə başlayacaq. Bu vaxt dediyiniz sözlər ötürülmür.",
                "Ringing. Translation starts as soon as they say “hello”. Until then, nothing you say is sent.",
              )}
            </p>
            {onMarkAnswered && (
              <Button className={styles.emptyAction} onClick={onMarkAnswered}>
                {tr("Artıq danışırıq", "We are already talking")}
              </Button>
            )}
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Icon name={live ? "headphones" : "wave"} size={20} />
            </div>
            <div className={styles.emptyTitle}>
              {live
                ? tr("Dinləyirəm", "Listening")
                : tr("Hələ danışıq yoxdur", "No conversation yet")}
            </div>
            <p className={styles.emptyText}>
              {live
                ? tr(
                    "Danışmağa başlayın. Hər cümlə bitəndən sonra tərcümə qarşı tərəfə çatacaq.",
                    "Start talking. After each sentence the translation reaches the other party.",
                  )
                : tr(
                    "Zəng başlayanda hər cümlənin orijinalı və tərcüməsi burada görünəcək. Zəng bitəndə hesabat avtomatik hazırlanacaq.",
                    "When the call starts, every sentence and its translation appear here. A report is prepared automatically when the call ends.",
                  )}
            </p>
          </div>
        ) : (
          entries.map((entry) => <MessageItem key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
}
