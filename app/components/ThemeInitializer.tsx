"use client";

import { useEffect } from "react";

const STORAGE_KEY = "agroposta_theme";

/**
 * ThemeInitializer — aplica html.dark según localStorage + prefers-color-scheme.
 * Independiente del layout, montado una vez en RootLayout.
 * No renderiza nada, solo sincroniza <html> class.
 * Density (.builder/.client) se maneja por wrappers en cada ruta, no acá,
 * para no colisionar al navegar entre / y /dev.
 */
export function ThemeInitializer() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const saved = localStorage.getItem(STORAGE_KEY);
      const isDark = saved ? saved === "dark" : media.matches;
      document.documentElement.classList.toggle("dark", isDark);
    }

    applyTheme();

    // Reaccionar a cambios OS y a updates desde ThemeToggle (storage event)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) applyTheme();
    };
    const onCustom = () => applyTheme();

    media.addEventListener("change", applyTheme);
    window.addEventListener("storage", onStorage);
    window.addEventListener("agroposta:theme-change" as unknown as string, onCustom);

    return () => {
      media.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("agroposta:theme-change" as unknown as string, onCustom);
    };
  }, []);

  return null;
}

export function getStoredTheme(): "light" | "dark" | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : null;
}

export function setStoredTheme(theme: "light" | "dark") {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event("agroposta:theme-change"));
}
