"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getStoredTheme, setStoredTheme } from "./ThemeInitializer";

type Props = {
  /** Clases extra para posicionar/mover el toggle sin tocar su lógica */
  className?: string;
  /** Variante visual: usa ap-btn styles */
  variant?: "ghost" | "secondary";
  size?: "sm" | "md";
  /** Mostrar label además del icono */
  showLabel?: boolean;
};

/**
 * ThemeToggle — botón independiente para dark/light.
 * Desacoplado: no importa dónde se monte, lee/escribe localStorage + html.dark.
 * Fácil de mover: <ThemeToggle className="ml-auto" /> en cualquier header/sidebar.
 * Preparado para Fase B (lucide): reemplazar ☀️/🌙 por <Sun>/<Moon size={iconBtn}> sin cambiar lógica.
 */
export function ThemeToggle({ className, variant = "ghost", size = "sm", showLabel = false }: Props) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const t = useTranslations("Sidebar");

  useEffect(() => {
    setMounted(true);
    const check = () => {
      const stored = getStoredTheme();
      if (stored) {
        setIsDark(stored === "dark");
      } else {
        setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
      }
    };
    check();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => check();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "agroposta_theme") check();
    };
    const onCustom = () => check();
    media.addEventListener("change", onChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("agroposta:theme-change" as unknown as string, onCustom);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("agroposta:theme-change" as unknown as string, onCustom);
    };
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    setStoredTheme(next ? "dark" : "light");
  }

  // Evitar mismatch SSR: render placeholder hasta montar
  if (!mounted) {
    return (
      <button
        className={`ap-btn ${variant === "ghost" ? "ap-btn--ghost" : "ap-btn--secondary"} ap-btn--${size} ${className ?? ""}`}
        aria-label={t("themeTitle")}
        disabled
        title={t("themeTitle")}
      >
        <span aria-hidden>◐</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`ap-btn ${variant === "ghost" ? "ap-btn--ghost" : "ap-btn--secondary"} ap-btn--${size} ${className ?? ""}`}
      aria-label={isDark ? t("themeToLight") : t("themeToDark")}
      title={t("themeTitle")}
      type="button"
    >
      <span aria-hidden className="text-[14px] leading-none">
        {isDark ? "☀️" : "🌙"}
      </span>
      {showLabel && <span className="text-small">{isDark ? "Claro" : "Oscuro"}</span>}
    </button>
  );
}
