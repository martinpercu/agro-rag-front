"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { useIconSize } from "../hooks/use-icon-size";
import { useTranslations } from "next-intl";

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
  const iconBtn = useIconSize("button");
  const t = useTranslations("Chat");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Auto-resize como Odoo chat-input 200px max (opcional, mejora UX)
  function adjustHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  return (
    <motion.form
      layout
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="dashboard-composer ap-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="dashboard-composer-inner ap-composer__inner">
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder ?? t("askPlaceholder")}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight(e.target as HTMLTextAreaElement);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="ap-textarea min-h-[44px] max-h-[120px] resize-none"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="ap-btn ap-btn--primary h-[44px] w-[44px] p-0 shrink-0"
          aria-label={disabled ? t("thinking") : t("send")}
          title={disabled ? t("thinking") : t("send")}
        >
          {disabled ? (
            <Loader2 size={iconBtn} className="animate-spin" />
          ) : value.trim() ? (
            <Send size={iconBtn} strokeWidth={1.7} />
          ) : (
            <Send size={iconBtn} strokeWidth={1.5} className="opacity-60" />
          )}
        </button>
      </div>
      <div className="dashboard-composer-hint">{t("baselineOnly")}</div>
    </motion.form>
  );
}
