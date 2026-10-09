import { useState, type FormEvent } from "react";
import type { LanguageCode } from "../../config/languages";
import { Button } from "../ui/Button";
import styles from "./DemoPanel.module.css";
import { tr } from "../../i18n/i18n";

/** Ready-made lines for the simulated other party; the last one of each set is a scam. */
const EXAMPLES: Partial<Record<LanguageCode, string[]>> = {
  ru: [
    "Здравствуйте! Да, квартира ещё свободна.",
    "Можете прийти в субботу в шесть вечера, аренда 600 манат.",
    "Назовите, пожалуйста, код из СМС.",
  ],
  en: [
    "Hello! Yes, the room is still available.",
    "Check-in is on Friday at 2 pm, the total is 240 dollars.",
    "Please read me the verification code we just sent.",
  ],
  tr: [
    "Merhaba, evet oda hâlâ müsait.",
    "Cuma günü saat ikide gelebilirsiniz, toplam 240 lira.",
    "Kart numaranızı söyler misiniz?",
  ],
  de: [
    "Guten Tag! Ja, das Zimmer ist noch frei.",
    "Sie können am Freitag um 14 Uhr kommen, insgesamt 240 Euro.",
    "Bitte nennen Sie Ihre Kartennummer.",
  ],
};

interface DemoPanelProps {
  live: boolean;
  friendLang: LanguageCode;
  onSay: (text: string) => void;
}

/** Public demo: explains the setup and lets the visitor play the other party. */
export function DemoPanel({ live, friendLang, onSay }: DemoPanelProps) {
  const [text, setText] = useState("");
  const examples = EXAMPLES[friendLang] ?? EXAMPLES.en ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSay(text.trim());
    setText("");
  };

  return (
    <section className={styles.card} aria-label="Demo">
      <div className={styles.head}>
        <span className={styles.badge}>Demo</span>
        <p>
          {live
            ? tr(
                "Mikrofona danışın: qarşı tərəf sizi tərcümə olunmuş eşidir. Aşağıda qarşı tərəfi oynayın: yazın və ya cümləyə klikləyin (sonuncu dələduzluqdur).",
                "Speak into your microphone: the other side hears you translated. Play the other party below: type or tap a line (the last one is a scam).",
              )
            : tr(
                "“Tərcüməni başlat” basın, mikrofona icazə verin və danışın. Real məhsulda bu, adi GSM zənginin içində işləyir (videoya baxın).",
                "Press “Start translation”, allow the microphone and speak. In the real product this runs inside an ordinary GSM call (see the video).",
              )}
        </p>
      </div>
      {live && (
        <>
          <div className={styles.examples}>
            {examples.map((line) => (
              <button key={line} type="button" className={styles.chip} onClick={() => onSay(line)}>
                {line}
              </button>
            ))}
          </div>
          <form className={styles.form} onSubmit={submit}>
            <input
              className={styles.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tr("Qarşı tərəf deyir…", "The other party says…")}
              aria-label={tr("Qarşı tərəfin dedikləri", "What the other party says")}
            />
            <Button type="submit" variant="primary">
              {tr("Göndər", "Send")}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
