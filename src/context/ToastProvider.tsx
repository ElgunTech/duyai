import { useCallback, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastKind } from "./toastContext";
import styles from "./ToastProvider.module.css";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const DURATION_MS: Record<ToastKind, number> = { info: 4000, success: 3000, error: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((list) => [...list.filter((t) => t.message !== message), { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), DURATION_MS[kind]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${t.kind === "error" ? styles.error : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
