import { createContext, useContext } from "react";

export type ToastKind = "info" | "success" | "error";

export type Notify = (message: string, kind?: ToastKind) => void;

export const ToastContext = createContext<Notify>(() => {});

/** Shows a short message at the bottom of the screen. */
export const useToast = () => useContext(ToastContext);
