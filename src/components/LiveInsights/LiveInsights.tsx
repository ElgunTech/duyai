import type { CallInsights } from "../../types";
import { ENTITY_ICON, INTENT_LABEL, OWNER_LABEL } from "../shared/callLabels";
import { Icon } from "../ui/Icon";
import styles from "./LiveInsights.module.css";
import { tr } from "../../i18n/i18n";

interface LiveInsightsProps {
  insights: CallInsights | null;
  updating: boolean;
  live: boolean;
}

/** What the AI understands from the call so far: intent, key facts and promises. */
export function LiveInsights({ insights, updating, live }: LiveInsightsProps) {
  if (!insights && !live) return null;

  return (
    <section className={styles.panel} aria-label="AI anlayışı" aria-live="polite">
      <header className={styles.head}>
        <h2>{tr("AI anlayışı", "AI insights")}</h2>
        {insights && <span className={styles.intent}>{INTENT_LABEL[insights.intent]}</span>}
        <span className={styles.status} data-updating={updating}>
          <i />
          {updating
            ? tr("Təhlil olunur…", "Analysing…")
            : (insights?.status ?? tr("Danışıq gözlənilir", "Waiting for the conversation"))}
        </span>
      </header>

      {insights && (insights.facts.length > 0 || insights.commitments.length > 0) ? (
        <div className={styles.body}>
          {insights.facts.length > 0 && (
            <ul className={styles.facts}>
              {insights.facts.map((fact, i) => (
                <li key={`${fact.label}-${i}`} className={styles.fact}>
                  <Icon name={ENTITY_ICON[fact.type] ?? "dot"} size={15} />
                  <span className={styles.factLabel}>{fact.label}</span>
                  <span className={styles.factValue}>{fact.value}</span>
                </li>
              ))}
            </ul>
          )}
          {insights.commitments.length > 0 && (
            <ul className={styles.commitments}>
              {insights.commitments.map((c, i) => (
                <li key={`${c.task}-${i}`}>
                  <span className={styles.owner} data-owner={c.owner}>
                    {OWNER_LABEL[c.owner]}
                  </span>
                  <span>{c.task}</span>
                  {c.due && <span className={styles.due}>{c.due}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className={styles.empty}>Tarix, qiymət, ünvan və ya vəd deyiləndə burada görünəcək.</p>
      )}
    </section>
  );
}
