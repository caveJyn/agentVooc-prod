import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initSuperTokens } from "./lib/superTokens";

initSuperTokens();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="min-h-screen bg-agentvooc-primary-bg dark:bg-agentvooc-primary-bg">
      <App />
    </main>
  </StrictMode>
);