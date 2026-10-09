import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./context/ToastProvider";
import { UiLangProvider } from "./i18n/UiLangProvider";
import "./styles/tokens.css";
import "./styles/base.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing in index.html");

createRoot(root).render(
  <StrictMode>
    <UiLangProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </UiLangProvider>
  </StrictMode>,
);
