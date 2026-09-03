"use client";

import { useEffect, useRef } from "react";
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
}: {
  messages: ChatMessage[];
  lang: "es" | "en";
  emptyHint?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isStreaming = messages.some((m) => m.streaming);
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="empty-state">
          <div className="empty-title">
            {lang === "en" ? "What do you want to investigate?" : "¿Qué querés investigar?"}
          </div>
          <div className="empty-subtitle">
            {lang === "en"
              ? "Ask about costs, margins or crops from Márgenes Agropecuarios. The answer cites page + edition."
              : "Preguntá sobre costos, márgenes o cultivos de Márgenes Agropecuarios. La respuesta cita página y edición."}
          </div>
          <div className="empty-examples">
            <span className="empty-chip">“margen maíz 80ha Pergamino”</span>
            <span className="empty-chip">“¿qué variedad de soja rinde más en 2026/05?”</span>
            <span className="empty-chip">“coste gasoil por ha”</span>
          </div>
          {emptyHint && <div className="empty-hint">{emptyHint}</div>}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="message-list">
      {messages.map((m) => {
        if (m.error) {
          return (
            <div key={m.id} className="bubble-row assistant">
              <div className="bubble assistant error">
                <div className="bubble-text" style={{ color: "var(--error)" }}>
                  {m.error}
                </div>
              </div>
            </div>
          );
        }
        return (
          <ChatBubble
            key={m.id}
            role={m.role}
            content={m.content}
            streaming={m.streaming}
            intent={m.intent}
            sources={m.sources}
            trace={m.trace}
            lang={lang}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
