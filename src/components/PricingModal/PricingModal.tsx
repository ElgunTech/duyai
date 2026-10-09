import { useToast } from "../../context/toastContext";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { PLANS } from "./plans";
import styles from "./PricingModal.module.css";

/** Subscription plans. Payments are not connected in this prototype. */
export function PricingModal({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const choose = (name: string) =>
    notify(`${name}: payments are not connected in this demo version`, "info");

  return (
    <Modal eyebrow="Subscription" title="Choose your plan" onClose={onClose} wide>
      <div className={styles.grid}>
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={styles.plan}
            data-highlight={plan.highlight || undefined}
          >
            {plan.highlight && <span className={styles.badge}>Most popular</span>}
            <h3 className={styles.name}>{plan.name}</h3>
            <p className={styles.tagline}>{plan.tagline}</p>
            <div className={styles.price}>
              <strong>{plan.price}</strong> <span>{plan.period}</span>
            </div>
            <div className={styles.minutes}>
              {plan.minutes}
              {plan.extra && <span> · {plan.extra}</span>}
            </div>
            <ul className={styles.features}>
              {plan.features.map((f) => (
                <li key={f.label} data-included={f.included}>
                  <span aria-hidden="true">{f.included ? "✓" : "–"}</span>
                  <span className={f.included ? undefined : styles.off}>
                    {f.label}
                    {!f.included && <span className={styles.srOnly}> (not included)</span>}
                  </span>
                </li>
              ))}
            </ul>
            {plan.id === "free" ? (
              <Button disabled>Current plan</Button>
            ) : (
              <Button
                variant={plan.highlight ? "primary" : "default"}
                onClick={() => choose(plan.name)}
              >
                Upgrade to {plan.name}
              </Button>
            )}
          </article>
        ))}
      </div>
      <p className={styles.note}>
        <Icon name="dollar" size={14} /> Annual billing: 2 months free · Students: 50% off Premium
        ($5.99) · Prices in USD
      </p>
    </Modal>
  );
}
