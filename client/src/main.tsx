import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initSuperTokens } from "./lib/superTokens";

initSuperTokens();

// Set initial theme to light unless explicitly saved as dark
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
  localStorage.setItem("theme", "light");
}

// Debug AdSense script loading
if (typeof window !== 'undefined') {
  const script = document.querySelector('script[src*="adsbygoogle.js"]');
  if (script) {
    script.addEventListener('load', () => {
      console.log('[main.tsx] AdSense script loaded successfully');
    });
    script.addEventListener('error', () => {
      console.error('[main.tsx] AdSense script failed to load');
    });
  } else {
    console.error('[main.tsx] AdSense script not found in DOM');
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <main className="min-h-screen">
      <App />
    </main>
  </StrictMode>
);