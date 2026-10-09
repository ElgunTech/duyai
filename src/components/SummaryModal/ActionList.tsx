import { useToast } from "../../context/toastContext";
import { useNotes } from "../../hooks/useNotes";
import {
  buildIcs,
  commitmentToReminder,
  downloadText,
  googleCalendarUrl,
  mailtoUrl,
  mapsUrl,
} from "../../lib/actions";
import type { ActionType, Commitment, SuggestedAction } from "../../types";
import { OWNER_LABEL } from "../shared/callLabels";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./SummaryModal.module.css";
import { tr } from "../../i18n/i18n";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const ACTION_ICON: Record<ActionType, IconName> = {
  calendar: "calendar",
  reminder: "clock",
  note: "square",
  map: "pin",
  email: "arrowOut",
};

/** "2026-10-12T14:00" → "12 okt 2026, 14:00" */
function formatWhen(iso: string, allDay: boolean): string {
  if (!iso) return "";
  const date = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(
    "az",
    allDay ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" },
  );
}

function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function CalendarButtons({ action }: { action: SuggestedAction }) {
  const google = googleCalendarUrl(action, TIME_ZONE);
  const ics = buildIcs(action, TIME_ZONE);
  if (!google || !ics) return null;
  const fileName = `${action.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "event"}.ics`;
  return (
    <>
      <Button size="sm" icon="calendar" onClick={() => openLink(google)}>
        Google Calendar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => downloadText(fileName, ics, "text/calendar")}
      >
        .ics
      </Button>
    </>
  );
}

function ActionButtons({ action, source }: { action: SuggestedAction; source: string }) {
  const notify = useToast();
  const { addNote } = useNotes();
  switch (action.type) {
    case "calendar":
    case "reminder":
      return <CalendarButtons action={action} />;
    case "map":
      return action.location ? (
        <Button size="sm" icon="pin" onClick={() => openLink(mapsUrl(action.location))}>
          {tr("Xəritədə aç", "Open in Maps")}
        </Button>
      ) : null;
    case "email":
      return (
        <Button
          size="sm"
          icon="arrowOut"
          onClick={() => openLink(mailtoUrl(action.title, action.details))}
        >
          {tr("E-poçt qaralaması", "E-mail draft")}
        </Button>
      );
    case "note":
      return (
        <Button
          size="sm"
          icon="square"
          onClick={() => {
            addNote({ title: action.title, text: action.details, source });
            notify(tr("Qeydlərə əlavə edildi", "Added to notes"), "success");
          }}
        >
          {tr("Qeydlərə əlavə et", "Add to notes")}
        </Button>
      );
  }
}

/** AI-suggested follow-ups, each with one-click buttons. */
export function ActionList({ actions, source }: { actions: SuggestedAction[]; source: string }) {
  if (!actions.length)
    return (
      <p className={styles.none}>{tr("Təklif olunan addım yoxdur", "No suggested actions")}</p>
    );
  return (
    <ul className={styles.actions}>
      {actions.map((action, i) => {
        const when = formatWhen(action.start, action.all_day);
        return (
          <li key={i} className={styles.action}>
            <span className={styles.actionIcon}>
              <Icon name={ACTION_ICON[action.type]} />
            </span>
            <div className={styles.actionBody}>
              <b>{action.title}</b>
              {(when || action.location) && (
                <span className={styles.actionMeta}>
                  {[when, action.location].filter(Boolean).join(" · ")}
                </span>
              )}
              {action.details && action.type !== "email" && (
                <span className={styles.actionDetails}>{action.details}</span>
              )}
            </div>
            <div className={styles.actionButtons}>
              <ActionButtons action={action} source={source} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Who promised what; my dated promises get a reminder button. */
export function CommitmentList({ commitments }: { commitments: Commitment[] }) {
  if (!commitments.length)
    return <p className={styles.none}>{tr("Öhdəlik yoxdur", "No commitments")}</p>;
  return (
    <ul className={styles.list}>
      {commitments.map((commitment, i) => {
        const reminder = commitment.owner === "me" ? commitmentToReminder(commitment) : null;
        const google = reminder ? googleCalendarUrl(reminder, TIME_ZONE) : null;
        return (
          <li key={i} className={styles.item}>
            <span className={styles.owner} data-owner={commitment.owner}>
              {OWNER_LABEL[commitment.owner]}
            </span>
            <span>{commitment.task}</span>
            {commitment.due && <span className={styles.due}>{commitment.due}</span>}
            {google && (
              <Button size="sm" variant="ghost" icon="clock" onClick={() => openLink(google)}>
                {tr("Xatırlat", "Remind me")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
