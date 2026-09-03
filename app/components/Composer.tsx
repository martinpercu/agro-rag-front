"use client";

import { useState } from "react";

export function Composer({
  onSend,
  disabled,
  lang,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  lang: "es" | "en";
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form
      className="dashboard-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="dashboard-composer-inner">
        <textarea
          rows={2}
          value={value}
          placeholder={
            placeholder ??
            (lang === "en"
              ? "Ask about Margenes Agropecuarios… (Shift+Enter for newline)"
              : "Preguntá sobre Márgenes Agropecuarios… (Shift+Enter para salto)")
          }
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled || !value.trim()}>
          {disabled ? (lang === "en" ? "Thinking…" : "Pensando…") : lang === "en" ? "Send" : "Enviar"}
        </button>
      </div>
      <div className="dashboard-composer-hint">
        {lang === "en"
          ? "Baseline only in prod · k/temp inherited from /dev · no location required"
          : "Solo baseline en prod · k/temp heredados de /dev · ubicación opcional"}
      </div>
    </form>
  );
}
