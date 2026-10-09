import { useToast } from "../../context/toastContext";
import type { CallReport } from "../../hooks/useCallReport";
import { average, formatSeconds } from "../../lib/format";
import { buildReportText, reportFileName } from "../../lib/report";
import { RISK_LABEL, isRisky } from "../../lib/scam";
import { ENTITY_ICON, INTENT_LABEL } from "../shared/callLabels";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { ActionList, CommitmentList } from "./ActionList";
import styles from "./SummaryModal.module.css";
import { getUiLang, tr } from "../../i18n/i18n";

interface SummaryModalProps {
  report: CallReport;
  onClose: () => void;
}

export function SummaryModal({ report, onClose }: SummaryModalProps) {
  const notify = useToast();
  const { summary, transcript, loading, error, myLang, friendLang, duration, memory } = report;
  const latencies = transcript.flatMap((e) => (e.latencyMs === undefined ? [] : [e.latencyMs]));
  const avgLatency = average(latencies);
  const riskyEntries = transcript.filter((e) => isRisky(e.risk));
  const text = () => buildReportText({ summary, transcript, myLang, friendLang, duration });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      notify(tr("Kopyalandı", "Copied"), "success");
    } catch {
      notify(tr("Kopyalamaq alınmadı", "Copy failed"), "error");
    }
  }

  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text()], { type: "text/plain;charset=utf-8" }));
    link.download = reportFileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const footer = (
    <>
      <Button variant="ghost" icon="copy" onClick={copy} disabled={loading}>
        {tr("Kopyala", "Copy")}
      </Button>
      <Button variant="ghost" icon="arrowIn" onClick={download} disabled={loading}>
        {tr("Yüklə", "Download")}
      </Button>
      <Button variant="primary" onClick={onClose}>
        {tr("Bağla", "Close")}
      </Button>
    </>
  );

  return (
    <Modal
      eyebrow={
        memory?.number
          ? `${tr("Zəng hesabatı", "Call report")} · ${memory.number}`
          : tr("Zəng hesabatı", "Call report")
      }
      title={summary?.title ?? tr("Zəngin xülasəsi", "Call summary")}
      onClose={onClose}
      footer={footer}
      wide
    >
      {loading && (
        <div className={styles.status}>
          <span className={styles.spinner} /> {tr("Zəng təhlil olunur…", "Analysing the call…")}
        </div>
      )}

      {error && (
        <div className={`${styles.status} ${styles.error}`}>
          {tr("Hesabat hazırlanmadı", "Report failed")}: {error}
        </div>
      )}

      {summary && (
        <>
          <div className={styles.badges}>
            <span className={styles.intent}>{INTENT_LABEL[summary.intent] ?? summary.intent}</span>
            <span className={styles.outcome}>
              <Icon name="check" size={14} />
              {summary.outcome}
            </span>
          </div>
          <p className={styles.text}>{summary.summary}</p>

          {summary.open_questions.length > 0 && (
            <div className={styles.questions} role="note">
              <Icon name="help" size={18} />
              <div>
                <b>{tr("Aydın olmayan məqamlar", "Open questions")}</b>
                <ul>
                  {summary.open_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {riskyEntries.length > 0 && (
            <div className={styles.security} role="note">
              <Icon name="shield" size={18} />
              <div>
                <b>
                  {tr(
                    `Bu zəngdə ${riskyEntries.length} şübhəli tələb aşkarlandı`,
                    `${riskyEntries.length} suspicious request(s) detected in this call`,
                  )}
                </b>
                <ul>
                  {riskyEntries.map((e) => (
                    <li key={e.id}>
                      <span>{e.time}</span> {tr("Qarşı tərəf", "The other party")}{" "}
                      {RISK_LABEL[e.risk!.category]}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <dl className={styles.kpis}>
            <Kpi
              label={tr("Dillər", "Languages")}
              value={`${myLang.toUpperCase()} – ${friendLang.toUpperCase()}`}
            />
            <Kpi label={tr("Müddət", "Duration")} value={duration} />
            <Kpi label={tr("Replikalar", "Lines")} value={String(transcript.length)} />
            <Kpi
              label={tr("Orta gecikmə", "Avg. latency")}
              value={avgLatency === null ? "—" : formatSeconds(avgLatency)}
            />
          </dl>

          <section className={styles.actionsSection}>
            <h4 className={styles.heading}>{tr("Növbəti addımlar", "Next steps")}</h4>
            <ActionList actions={summary.actions} source={summary.title} />
          </section>

          {memory && memory.previous.length > 0 && (
            <section className={styles.memory}>
              <h4 className={styles.heading}>
                {tr("Bu nömrə ilə əvvəlki zənglər", "Earlier calls with this number")}
              </h4>
              <ul className={styles.memoryList}>
                {memory.previous.map((call) => (
                  <li key={call.id}>
                    <div className={styles.memoryHead}>
                      <b>{call.title}</b>
                      <span>{formatCallDate(call.startedAt)}</span>
                    </div>
                    {call.outcome && <span className={styles.memoryOutcome}>{call.outcome}</span>}
                    {call.commitments.length > 0 && (
                      <ul className={styles.memoryPromises}>
                        {call.commitments.map((p, i) => (
                          <li key={i}>
                            <span className={styles.owner} data-owner={p.owner}>
                              {p.owner === "me"
                                ? tr("Sən", "You")
                                : tr("Qarşı tərəf", "Other party")}
                            </span>
                            {p.task}
                            {p.due && <span className={styles.due}>{p.due}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.grid}>
            <section>
              <h4 className={styles.heading}>{tr("Vacib məlumatlar", "Key facts")}</h4>
              {summary.entities.length ? (
                <ul className={styles.list}>
                  {summary.entities.map((entity, i) => (
                    <li key={i} className={styles.fact}>
                      <Icon name={ENTITY_ICON[entity.type] ?? "dot"} />
                      <span className={styles.factLabel}>{entity.label}</span>
                      <span className={styles.factValue}>{entity.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>{tr("Tapılmadı", "None found")}</p>
              )}
            </section>

            <section>
              <h4 className={styles.heading}>{tr("Kim nə vəd etdi", "Who promised what")}</h4>
              <CommitmentList commitments={summary.commitments} />

              <h4 className={styles.heading}>{tr("Razılaşmalar", "Agreements")}</h4>
              {summary.agreements.length ? (
                <ul className={styles.list}>
                  {summary.agreements.map((agreement, i) => (
                    <li key={i} className={styles.item} data-kind="agreement">
                      <Icon name="check" />
                      <span>{agreement}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.none}>{tr("Yoxdur", "None")}</p>
              )}
            </section>
          </div>
        </>
      )}
    </Modal>
  );
}

const formatCallDate = (ms: number) =>
  new Date(ms).toLocaleString(getUiLang() === "az" ? "az" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kpi}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
