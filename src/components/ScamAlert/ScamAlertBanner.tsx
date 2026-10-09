import { RISK_LABEL } from "../../lib/scam";
import type { ScamAlert } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./ScamAlertBanner.module.css";
import { tr } from "../../i18n/i18n";

const advice = () =>
  tr(
    "Heç bir kod, kart məlumatı və ya şifrə deməyin. Şübhəniz varsa, zəngi bitirin və bankın rəsmi nömrəsinə özünüz zəng edin.",
    "Do not share any code, card details or password. If in doubt, hang up and call your bank's official number yourself.",
  );

interface ScamAlertBannerProps {
  alerts: ScamAlert[];
  onDismiss: (id: number) => void;
}

/** Prominent warning for the most recent risky request of the other party. */
export function ScamAlertBanner({ alerts, onDismiss }: ScamAlertBannerProps) {
  const alert = alerts.at(-1);
  if (!alert) return null;

  const danger = alert.level === "danger";
  const title = danger
    ? tr(
        `Fırıldaq riski! Qarşı tərəf ${RISK_LABEL[alert.category]}`,
        `Scam risk! The other party ${RISK_LABEL[alert.category]}`,
      )
    : tr(
        `Diqqət: qarşı tərəf ${RISK_LABEL[alert.category]}`,
        `Warning: the other party ${RISK_LABEL[alert.category]}`,
      );

  return (
    <section className={styles.banner} data-level={alert.level} role="alert">
      <div className={styles.icon}>
        <Icon name="shield" size={22} />
      </div>
      <div className={styles.content}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.text}>{alert.reason || advice()}</p>
        {alert.reason && <p className={styles.text}>{advice()}</p>}
        <p className={styles.quote}>
          <span>{alert.time}</span> “{alert.quote}”
        </p>
      </div>
      <div className={styles.actions}>
        {alerts.length > 1 && <span className={styles.count}>+{alerts.length - 1}</span>}
        <Button variant="ghost" onClick={() => onDismiss(alert.id)}>
          {tr("Anladım", "Got it")}
        </Button>
      </div>
    </section>
  );
}
