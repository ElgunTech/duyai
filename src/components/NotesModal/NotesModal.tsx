import { useToast } from "../../context/toastContext";
import { useNotes } from "../../hooks/useNotes";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import styles from "./NotesModal.module.css";
import { tr } from "../../i18n/i18n";

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString("az", { dateStyle: "medium", timeStyle: "short" });

/** Notes saved from call reports. */
export function NotesModal({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const { notes, removeNote } = useNotes();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(tr("Kopyalandı", "Copied"), "success");
    } catch {
      notify(tr("Kopyalamaq alınmadı", "Copy failed"), "error");
    }
  }

  return (
    <Modal
      eyebrow={tr("Zənglərdən", "From your calls")}
      title={tr("Qeydlər", "Notes")}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          {tr("Bağla", "Close")}
        </Button>
      }
    >
      {notes.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="square" size={20} />
          <p>
            {tr("Hələ qeyd yoxdur. Zəng hesabatında", "No notes yet. Use")}{" "}
            <b>{tr("“Qeydlərə əlavə et”", "“Add to notes”")}</b>{" "}
            {tr(
              "düyməsi ilə vacib məlumatları buraya yığa bilərsiniz.",
              "in a call report to collect key facts here.",
            )}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {notes.map((note) => (
            <li key={note.id} className={styles.note}>
              <div className={styles.head}>
                <b>{note.title}</b>
                <div className={styles.tools}>
                  <IconButton
                    icon="copy"
                    label="Kopyala"
                    onClick={() => copy(`${note.title}\n${note.text}`)}
                  />
                  <IconButton icon="close" label="Sil" onClick={() => removeNote(note.id)} />
                </div>
              </div>
              {note.text && <p className={styles.text}>{note.text}</p>}
              <span className={styles.meta}>
                {formatDate(note.createdAt)}
                {note.source && ` · ${note.source}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
