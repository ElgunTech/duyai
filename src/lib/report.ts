import type { LanguageCode } from "../config/languages";
import { langName, tr } from "../i18n/i18n";
import type { CallSummary, Speaker, TranscriptEntry } from "../types";
import { RISK_LABEL, isRisky } from "./scam";

const SPEAKER_NAMES: Record<Speaker, string> = {
  get me() {
    return tr("Mən", "Me");
  },
  get friend() {
    return tr("Qarşı tərəf", "Other party");
  },
  get ai() {
    return tr("AI (mənim adımdan)", "AI (on my behalf)");
  },
};

interface ReportInput {
  summary: CallSummary | null;
  transcript: TranscriptEntry[];
  myLang: LanguageCode;
  friendLang: LanguageCode;
  duration: string;
}

/** Plain-text call report used for "Copy" and "Download". */
export function buildReportText({
  summary,
  transcript,
  myLang,
  friendLang,
  duration,
}: ReportInput): string {
  const lines: string[] = [];

  if (summary) {
    lines.push(
      `${tr("ZƏNG HESABATI", "CALL REPORT")} — ${summary.title}`,
      "",
      `${tr("Nəticə", "Outcome")}: ${summary.outcome}`,
      `${tr("Dillər", "Languages")}: ${langName(myLang)} – ${langName(friendLang)}`,
      `${tr("Müddət", "Duration")}: ${duration}`,
      "",
      summary.summary,
      "",
    );
    const section = (title: string, items: string[]) => {
      if (!items.length) return;
      lines.push(title, ...items.map((item) => `• ${item}`), "");
    };
    section(
      tr("VACİB MƏLUMATLAR", "KEY FACTS"),
      summary.entities.map((e) => `${e.label}: ${e.value}`),
    );
    section(tr("RAZILAŞMALAR", "AGREEMENTS"), summary.agreements);
    section(
      tr("ÖHDƏLİKLƏR", "COMMITMENTS"),
      summary.commitments.map((x) => {
        const who = x.owner === "me" ? SPEAKER_NAMES.me : SPEAKER_NAMES.friend;
        return x.due ? `${who}: ${x.task} (${x.due})` : `${who}: ${x.task}`;
      }),
    );
    section(
      tr("NÖVBƏTİ ADDIMLAR", "NEXT STEPS"),
      summary.actions.map((x) => (x.start ? `${x.title} (${x.start.replace("T", " ")})` : x.title)),
    );
    section(tr("AYDIN OLMAYAN MƏQAMLAR", "OPEN QUESTIONS"), summary.open_questions);
  }

  const risky = transcript.filter((e) => isRisky(e.risk));
  if (risky.length) {
    lines.push(tr("⚠ TƏHLÜKƏSİZLİK XƏBƏRDARLIQLARI", "⚠ SECURITY WARNINGS"));
    for (const e of risky)
      lines.push(`• [${e.time}] ${SPEAKER_NAMES.friend} ${RISK_LABEL[e.risk!.category]}`);
    lines.push("");
  }

  lines.push(tr("TRANSKRİPT", "TRANSCRIPT"));
  for (const entry of transcript) {
    const speaker = SPEAKER_NAMES[entry.who];
    lines.push(
      `[${entry.time}] ${speaker}: ${entry.original}`,
      `        → ${entry.translation || "—"}`,
    );
  }
  return lines.join("\n");
}

/** File name like "zeng-2026-10-08-1430.txt". */
export function reportFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `zeng-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.txt`;
}
