"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ChatBubble } from "./ChatBubble";

type Source = {
  pagina: number;
  seccion: string;
  cultivo?: string | null;
  campana?: string | null;
  tipo: string;
  score: number;
};

type TraceStep = {
  step: string;
  detail: string;
  ms: number;
  acc_ms: number;
  at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  sources?: Source[];
  trace?: TraceStep[];
  streaming?: boolean;
  error?: string;
};

export function MessageList({
  messages,
  lang,
  emptyHint,
  onExample,
}: {
  messages: ChatMessage[];
  lang: "es" | "en";
  emptyHint?: string;
  onExample?: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("MessageList");

  useEffect(() => {
    const isStreaming = messages.some((m) => m.streaming);
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduceMotion || isStreaming ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  if (messages.length === 0) {
    const examples = [t("example1"), t("example2"), t("example3")];
    return (
      <div className="message-list empty">
        <div className="ap-card empty-state p-6 text-center max-w-[520px] mx-auto">
          <div className="empty-title">{t("what")}</div>
          <div className="empty-subtitle">{t("subtitle")}</div>
          <div className="empty-examples flex flex-wrap gap-2 justify-center mt-3">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                className="ap-badge ap-badge--neutral empty-chip"
                onClick={() => onExample?.(ex)}
                disabled={!onExample}
              >
                “{ex}”
              </button>
            ))}
          </div>
          {emptyHint && <div className="empty-hint">{emptyHint}</div>}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="message-list">
      <AnimatePresence initial={false}>
        {messages.map((m) => {
          if (m.error) {
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="bubble-row assistant"
              >
                <div className="ap-bubble ap-bubble--assistant is-error bubble assistant error" role="alert">
                  <div className="bubble-text text-error">{m.error}</div>
                </div>
              </motion.div>
            );
          }
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <ChatBubble
                role={m.role}
                content={m.content}
                streaming={m.streaming}
                intent={m.intent}
                sources={m.sources}
                trace={m.trace}
                lang={lang}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
