"use client";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "sudibran-theme";

/**
 * Runs before the page paints, so the first frame is already in the right
 * theme. Kept as a string because it is injected into the document head.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

/** The pill switch in the nav: carbon on the left, paper on the right. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // The inline script has already decided; read back what it chose.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.add("theme-turn");
    root.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing: the choice just won't outlive the tab.
    }
    window.setTimeout(() => root.classList.remove("theme-turn"), 320);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={flip}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border border-rule bg-sunk transition-colors hover:border-ink-3"
    >
      <span
        className="grid size-[22px] place-items-center rounded-full bg-ink text-onink transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${dark ? 27 : 2}px)` }}
      >
        {dark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
      <path d="M13.3 9.9A5.8 5.8 0 0 1 6.1 2.7a5.9 5.9 0 1 0 7.2 7.2Z" />
    </svg>
  );
}
