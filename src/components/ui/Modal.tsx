import { useEffect, useId, type ReactNode } from "react";
import { IconButton } from "./Button";
import styles from "./Modal.module.css";
import { tr } from "../../i18n/i18n";

interface ModalProps {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

/** Dialog with backdrop; closes on Escape or backdrop click. */
export function Modal({ eyebrow, title, onClose, footer, wide, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={wide ? `${styles.card} ${styles.wide}` : styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.head}>
          <div>
            {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          </div>
          <IconButton icon="close" label={tr("Bağla", "Close")} onClick={onClose} autoFocus />
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.foot}>{footer}</footer>}
      </div>
    </div>
  );
}
