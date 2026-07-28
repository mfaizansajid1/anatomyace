import { useEffect, useState } from "react";

type Mode = "light" | "dark";

function currentMode(): Mode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("aa-theme", mode);
  } catch {
    // ignore
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    setMode(currentMode());
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    applyTheme(next);
    setMode(next);
  }

  const isDark = mode === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card text-foreground hover:bg-muted transition ${className}`}
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
