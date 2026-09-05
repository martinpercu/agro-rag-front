"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

type Lang = "es" | "en";

type Source = {
  pagina: number;
  seccion: string;
  cultivo?: string | null;
  campana?: string | null;
  tipo: string;
  score: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

export type TraceStep = {
  step: string;
  detail: string;
  ms: number;
  acc_ms: number;
  at: string;
};

export type CardState = {
  status: "idle" | "retrieving" | "streaming" | "done" | "error";
  intent?: string;
  answer: string;
  sources: Source[];
  trace?: TraceStep[];
  error?: string;
  retrievalMs?: number;
  answererMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  numSources?: number;
  distinctSources?: number;
};

const LABELS: Record<string, { label: Record<Lang, string>; tone: string }> = {
  baseline: { label: { es: "Semántica", en: "Semantic" }, tone: "neutral" },
  hybrid: { label: { es: "Hybrid BM25", en: "Hybrid BM25" }, tone: "green" },
  rerank: { label: { es: "Rerank LLM", en: "Rerank LLM" }, tone: "purple" },
  query_rewrite: { label: { es: "Query Rewrite", en: "Query Rewrite" }, tone: "orange" },
  multi_query: { label: { es: "Multi Query", en: "Multi Query" }, tone: "teal" },
  hyde: { label: { es: "HyDe", en: "HyDe" }, tone: "red" },
  lexical: { label: { es: "Lexical BM25", en: "Lexical BM25" }, tone: "blue" },
};

export function StrategyCard({
  name,
  lang,
  enabled,
  onToggle,
  state,
  history,
  isStreaming,
}: {
  name: string;
  lang: Lang;
  enabled: boolean;
  onToggle: () => void;
  state: CardState;
  history: Message[];
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const meta = LABELS[name] || { label: { es: name, en: name }, tone: "neutral" };
  const label = meta.label[lang];
  const t = useTranslations("StrategyCard");

  useEffect(() => {
    if (isStreaming) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [state.answer, history, isStreaming]);

  // ap-* canónico + legacy alias para transición (globals.css mantiene alias)
  const isStreamingCard = state.status === "streaming" || state.status === "retrieving";
  const cardClasses = [
    "ap-card",
    `ap-card--tone-${meta.tone}`,
    isStreamingCard ? "is-streaming" : "",
    !enabled ? "is-disabled" : "",
    state.status === "error" ? "is-error" : "",
    // legacy aliases por compat (se pueden borrar en Fase B done)
    `strategy-card tone-${meta.tone} status-${state.status}`,
    !enabled ? "disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      <div className="ap-card__header strategy-card-header">
        <div className="ap-card__title strategy-card-title">
          <span className="strategy-name">{label}</span>
          {state.intent && state.status === "done" && (
            <span className="ap-badge--intent intent-badge">{state.intent}</span>
          )}
        </div>
        <button
          className={`ap-toggle strategy-toggle ${enabled ? "is-on on" : ""}`}
          onClick={onToggle}
          title={enabled ? "Desactivar" : "Activar"}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      <div ref={scrollRef} className="ap-card__body strategy-card-body">
        {history.length === 0 && state.status === "idle" && (
          <div className="ap-card__empty strategy-empty">{t("esperando")}</div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`strategy-msg ${msg.role}`}>
            <div className="strategy-msg-label">
              {msg.role === "user" ? t("tu") : label}
            </div>
            <div className="strategy-msg-text">{msg.content}</div>
          </div>
        ))}

        {state.status === "retrieving" && (
          <div className="strategy-msg assistant">
            <div className="strategy-msg-label">{label}</div>
            <div className="strategy-msg-text">
              <span className="spinner" />
              {t("buscando")}
            </div>
          </div>
        )}

        {state.status === "streaming" && (
          <div className="strategy-msg assistant">
            <div className="strategy-msg-label">{label}</div>
            <div className="strategy-msg-text">{state.answer}<span className="cursor-blink">▌</span></div>
          </div>
        )}

        {state.status === "error" && (
          <div className="strategy-msg assistant">
            <div className="strategy-msg-label">{label}</div>
            <div className="strategy-msg-text strategy-error">{state.error || t("errorDesconocido")}</div>
          </div>
        )}
      </div>

      <div className="ap-card__footer strategy-card-footer">
        {state.status === "done" && (
          <div className="ap-card__metrics strategy-metrics">
            <span className="ap-badge--metric metric-chip">⏱ {Math.round(state.answererMs || 0)}ms</span>
            <span className="ap-badge--metric metric-chip">📄 {state.numSources}/{state.distinctSources}</span>
            <span className="ap-badge--metric metric-chip">🎟 {state.inputTokens}+{state.outputTokens}</span>
          </div>
        )}
        {state.status === "done" && state.sources.length > 0 && (
          <>
            <button
              className="ap-btn ap-btn--ghost ap-btn--sm card-toggle"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? t("ocultarFuentes") : t("verFuentes")}
            </button>
            {expanded && (
              <div className="ap-log ap-log--dashed card-sources">
                {state.sources.slice(0, 6).map((s, j) => (
                  <ScoreBar key={j} source={s} maxScore={maxScore(state.sources)} />
                ))}
              </div>
            )}
          </>
        )}
      {state.status === "done" && state.trace && state.trace.length > 0 && (
          <>
            <button
              className="ap-btn ap-btn--ghost ap-btn--sm card-toggle"
              onClick={() => setTraceExpanded(!traceExpanded)}
            >
              {traceExpanded ? t("ocultarTrace") : t("verTrace")}
            </button>
            {traceExpanded && (
              <div className="ap-log ap-log--dashed card-trace">
                {state.trace.map((s, j) => (
                  <div key={j} className="ap-trace-item trace-item">
                    <div className="trace-row">
                      <span className="ap-trace-step trace-step">{s.step}</span>
                      <span className="ap-trace-ms trace-ms">{Math.round(s.ms)}ms</span>
                      <span className="ap-trace-acc trace-acc">acc {Math.round(s.acc_ms)}ms</span>
                    </div>
                    {s.detail && <div className="ap-trace-detail trace-detail">{s.detail}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function maxScore(sources: Source[]): number {
  return Math.max(...sources.map((s) => s.score ?? 0), 0.0001);
}

function ScoreBar({ source, maxScore }: { source: Source; maxScore: number }) {
  const pct = Math.round(((source.score ?? 0) / maxScore) * 100);
  return (
    <div className="ap-source source-item">
      <div className="source-score-row">
        <span className="ap-source__label source-score-label">
          pag. {source.pagina} · {source.seccion}
          {source.cultivo ? ` · ${source.cultivo}` : ""}
        </span>
        <span className="ap-source__value source-score-value">{(source.score ?? 0).toFixed(3)}</span>
      </div>
      <div
        className="ap-source__bar source-score-bar"
        style={{ "--k-pct": `${pct}%`, "--pct": `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
