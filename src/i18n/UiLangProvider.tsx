import { useCallback, useMemo, useState, type ReactNode } from "react";
import { getUiLang, setUiLangGlobal, UiLangContext, type UiLang } from "./i18n";

/**
 * Holds the interface language. App subscribes with useUiLang(), so a change re-renders
 * the whole tree in the new language without resetting a call in progress.
 */
export function UiLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(getUiLang);
  const setLang = useCallback((next: UiLang) => {
    setUiLangGlobal(next);
    setLangState(next);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <UiLangContext.Provider value={value}>{children}</UiLangContext.Provider>;
}
