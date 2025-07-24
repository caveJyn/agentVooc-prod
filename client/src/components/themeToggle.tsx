// /client/src/components/ThemeToggle.tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react"; // Assuming you have lucide-react for icons

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    // Initialize theme from local storage or system preference
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme as "light" | "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    // Apply theme to html element
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    // Save theme to local storage
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <Button
      variant="default"
      size="icon"
      className=""
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}