import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./styles.css";

const JournalMapDemo = import.meta.env.DEV ? React.lazy(() => import("./pages/JournalMapDemo")) : null;

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {JournalMapDemo && /^\/dev\/journal-map\/(work|sales)$/.test(window.location.pathname)
      ? <React.Suspense fallback={<p>지도 시안 준비 중</p>}><JournalMapDemo /></React.Suspense>
      : <App />}
  </React.StrictMode>,
);
