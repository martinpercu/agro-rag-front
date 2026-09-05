"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { NextIntlClientProvider } from "next-intl";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";

type Locale = "es" | "en";

const messagesMap: Record<Locale, Record<string, unknown>> = {
  es: esMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "es",
  setLocale: () => {},
  toggleLocale: () => {},
});

export function useAppLocale() {
  return useContext(I18nContext);
}

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "es";
  const v = localStorage.getItem("agroposta_lang");
  return v === "en" || v === "es" ? (v as Locale) : "es";
}

/**
 * I18nProvider — desacoplado, movible, sin routing [locale].
 * Usa localStorage agroposta_lang + NextIntlClientProvider.
 * Mantiene compat con TEXTS manual vía evento agroposta:lang-change.
 * Futuro: si se migra a proxy [locale], este provider puede leer params.locale y sincronizar cookie.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    setLocaleState(readStoredLocale());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "agroposta_lang" && (e.newValue === "es" || e.newValue === "en")) {
        setLocaleState(e.newValue as Locale);
      }
    };
    const onCustom = () => setLocaleState(readStoredLocale());
    const onVis = () => {
      if (document.visibilityState === "visible") setLocaleState(readStoredLocale());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("agroposta:lang-change" as unknown as string, onCustom);
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("agroposta:lang-change" as unknown as string, onCustom);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("agroposta_lang", l);
    window.dispatchEvent(new Event("agroposta:lang-change"));
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "es" ? "en" : "es");
  }, [locale, setLocale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, toggleLocale }}>
      <NextIntlClientProvider locale={locale} messages={messagesMap[locale]} timeZone="America/Argentina/Buenos_Aires">
        {children}
      </NextIntlClientProvider>
    </I18nContext.Provider>
  );
}
