import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { getUiLang, tr } from "../../i18n/i18n";
import styles from "./GuideModal.module.css";

interface Step {
  title: string;
  /** true = done, false = problem detected, undefined = cannot be checked automatically */
  done?: boolean;
  body: ReactNode;
}

interface GuideModalProps {
  cablesReady: boolean;
  keysReady: boolean | undefined;
  devicesReady: boolean;
  onClose: () => void;
}

export function GuideModal({ cablesReady, keysReady, devicesReady, onClose }: GuideModalProps) {
  const az = getUiLang() === "az";
  const steps: Step[] = [
    {
      title: tr("Virtual səs kabelləri", "Virtual audio cables"),
      done: cablesReady,
      body: (
        <p>
          {az ? "Pulsuz: " : "Free: "}
          <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">
            VB-CABLE
          </a>{" "}
          (<code>VBCABLE_Setup_x64.exe</code> → Install Driver){az ? " və " : " and "}
          <a href="https://vb-audio.com/Voicemeeter/" target="_blank" rel="noreferrer">
            Voicemeeter
          </a>
          .{" "}
          {az
            ? "Voicemeeter açıq qalsın: VIRTUAL INPUT zolağında yalnız B yanılı olsun."
            : "Keep Voicemeeter open: on the VIRTUAL INPUT strip only B should be on."}
        </p>
      ),
    },
    {
      title: tr("API açarları", "API keys"),
      done: keysReady,
      body: (
        <p>
          {az
            ? ".env faylına Azure Speech, Azure Translator və Anthropic açarlarını yazın, sonra serveri yenidən başladın."
            : "Put the Azure Speech, Azure Translator and Anthropic keys into .env, then restart the server."}
        </p>
      ),
    },
    {
      title: tr("Windows səs ayarları", "Windows sound settings"),
      body: (
        <>
          <p>
            <code>mmsys.cpl</code> → <b>{az ? "Kayıt" : "Recording"}</b>:{" "}
            <code>Voicemeeter Out B1</code>{" "}
            {az
              ? "həm Varsayılan Aygıt, həm də Varsayılan İletişim Aygıtı olsun (AI səsi zəngə gedir)."
              : "as both Default Device and Default Communication Device (the AI voice goes into the call)."}
          </p>
          <p>
            {az
              ? "Eyni yerdə “Stereo Karışımı” cihazına sağ klikləyib Etkinleştir seçin: qarşı tərəfin səsi buradan alınır. Qulaqlıq istifadə edin."
              : "In the same list, right-click “Stereo Mix” → Enable: the other party's voice is captured from it. Use headphones."}
          </p>
        </>
      ),
    },
    {
      title: tr("Cihazları yoxlayın", "Check the devices"),
      done: devicesReady,
      body: (
        <p>
          {az
            ? "Mikrofon və qulaqlıq sizinki olsun; “Zəngdən gələn” = Stereo Karışımı, “Zəngə gedən” = Voicemeeter Input. Hər birini Test ilə yoxlayın."
            : "Microphone and headphones are your own; “Call in” = Stereo Mix, “Call out” = Voicemeeter Input. Check each one with Test."}
        </p>
      ),
    },
  ];

  // Official download pages only: we never redistribute third-party installers.
  const downloads = [
    {
      name: "VB-CABLE",
      note: tr("virtual kabel (pulsuz)", "virtual cable (free)"),
      url: "https://vb-audio.com/Cable/",
    },
    {
      name: "Voicemeeter",
      note: tr("səs mikseri (pulsuz)", "audio mixer (free)"),
      url: "https://vb-audio.com/Voicemeeter/",
    },
    {
      name: tr("Telefon Bağlantısı (PC)", "Phone Link (PC)"),
      note: "Microsoft Store",
      url: "https://apps.microsoft.com/detail/9nmpj99vjbwv",
    },
    {
      name: tr("Windows-a keçid (Android)", "Link to Windows (Android)"),
      note: "Google Play",
      url: "https://play.google.com/store/apps/details?id=com.microsoft.appmanager",
    },
    {
      name: "Node.js",
      note: tr("lokal server üçün", "for the local server"),
      url: "https://nodejs.org/",
    },
  ];

  return (
    <Modal
      eyebrow={tr("Bir dəfəlik", "One time")}
      title={tr("Quraşdırma", "Setup")}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          {tr("Anladım", "Got it")}
        </Button>
      }
    >
      <section
        className={styles.downloads}
        aria-label={tr("Rəsmi yükləmələr", "Official downloads")}
      >
        <p className={styles.downloadsTitle}>
          {tr("Rəsmi saytlardan yükləyin", "Download from the official sites")}
        </p>
        <div className={styles.downloadGrid}>
          {downloads.map((d) => (
            <a
              key={d.url}
              className={styles.download}
              href={d.url}
              target="_blank"
              rel="noreferrer"
            >
              <b>{d.name}</b>
              <span>{d.note}</span>
            </a>
          ))}
        </div>
      </section>
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={step.title} className={styles.step} data-done={step.done}>
            <div className={styles.stepHead}>
              <span className={styles.number}>{step.done ? "✓" : i + 1}</span>
              <b>{step.title}</b>
            </div>
            <div className={styles.stepBody}>{step.body}</div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
