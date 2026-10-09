import { useCallback, useEffect, useState } from "react";
import { storage } from "../lib/storage";

export interface Note {
  id: string;
  title: string;
  text: string;
  /** Epoch ms */
  createdAt: number;
  /** Title of the call the note came from. */
  source?: string;
}

const KEY = "notes";
const CHANGE_EVENT = "acl:notes-changed";

function readNotes(): Note[] {
  try {
    const parsed: unknown = JSON.parse(storage.get(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

function writeNotes(notes: Note[]): void {
  storage.set(KEY, JSON.stringify(notes));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Notes saved from call reports; kept in this browser and shared by all components. */
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(readNotes);

  useEffect(() => {
    const sync = () => setNotes(readNotes());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const addNote = useCallback((note: Omit<Note, "id" | "createdAt">) => {
    const entry: Note = { ...note, id: crypto.randomUUID(), createdAt: Date.now() };
    writeNotes([entry, ...readNotes()]);
    return entry;
  }, []);

  const removeNote = useCallback((id: string) => {
    writeNotes(readNotes().filter((n) => n.id !== id));
  }, []);

  return { notes, addNote, removeNote };
}
