import { useCallback, useEffect } from "react";
import { usePersistentState } from "./usePersistentState";

export type Theme = "light" | "dark";

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Light/dark theme stored per viewer; defaults to the OS preference. */
export function useTheme() {
  const [theme, setTheme] = usePersistentState<Theme>("theme", systemTheme(), (raw) =>
    raw === "light" || raw === "dark" ? raw : null,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, toggle };
}
