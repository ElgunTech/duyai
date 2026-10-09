import { useCallback, useState } from "react";
import { storage } from "../lib/storage";

/**
 * useState that is saved to localStorage. `parse` validates the stored string and
 * returns null for anything unexpected, in which case `initial` is used.
 */
export function usePersistentState<T extends string | boolean>(
  key: string,
  initial: T,
  parse: (raw: string) => T | null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = storage.get(key);
    const parsed = raw === null ? null : parse(raw);
    return parsed ?? initial;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      storage.set(key, String(next));
    },
    [key],
  );

  return [value, update];
}

export const parseBoolean = (raw: string) =>
  raw === "true" ? true : raw === "false" ? false : null;
