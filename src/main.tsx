import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import { registerSW } from "virtual:pwa-register";
import { App } from "@/app/App";
import { watchThemeColor } from "@/lib/theme";

// Caches the app shell for offline use; a new version is picked up on the next load.
registerSW({ immediate: true });
watchThemeColor();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
