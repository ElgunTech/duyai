import { tr } from "../../i18n/i18n";
import styles from "./DemoLimits.module.css";

/** What only works in the full local setup, listed honestly so judges know why. */
export function DemoLimits() {
  const items = [
    tr(
      "Real GSM zəngi: telefon Bluetooth ilə kompüterə (Telefon Bağlantısı) qoşulmalıdır. Videoda göstərilir.",
      "Real GSM call: the phone must be paired to the computer via Bluetooth (Phone Link). Shown in the video.",
    ),
    tr(
      "Zəng başlayanda avtomatik başlama: Windows-un zəng siqnalından istifadə edir.",
      "Automatic start when a call begins: uses the Windows call signal.",
    ),
    tr(
      "Telefondan telefona rejim (Twilio): trial hesabla yalnız təsdiqlənmiş nömrələrə zəng etmək olur.",
      "Phone-to-phone mode (Twilio): a trial account can only call verified numbers.",
    ),
    tr(
      "Zəngin telefonda canlı göstərilməsi (QR): eyni Wi-Fi şəbəkəsi tələb edir. Burada QR demonu telefonda açır.",
      "Live mirroring of the call to a phone (QR): needs the same Wi-Fi. Here the QR opens this demo on the phone.",
    ),
    tr(
      "Virtual kabel və Voicemeeter ilə səs yönləndirməsi, zəng nömrəsinin Telefon Bağlantısından tapılması.",
      "Audio routing with virtual cables and Voicemeeter, and reading the caller's number from Phone Link.",
    ),
  ];
  return (
    <section
      className={styles.limits}
      aria-label={tr("Onlayn demonun hədləri", "Online demo limits")}
    >
      <h2>{tr("Yalnız tam (lokal) versiyada", "Only in the full (local) version")}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
