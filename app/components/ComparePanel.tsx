"use client";
// @deprecated — legacy non-stream 6 cards, usa StrategyCard + /dev sse. No borrar hasta Fase B done, solo referencia. Ver PLAN §A4
// Si se mounta, avisa en consola para detectar uso indebido.

import { useState, useEffect } from "react";

type Source = {
  pagina: number;
  seccion: string;
  cultivo?: string | null;
  campana?: string | null;
  tipo: string;
  score: number;
};

type Metrics = {
  retrieval_ms: number;
  answerer_ms: number;
  total_ms: number;
  answerer_input_tokens: number;
  answerer_output_tokens: number;
  aux_llm_input_tokens: number;
  aux_llm_output_tokens: number;
  num_sources: number;
  distinct_sources: number;
  intent?: string;
  error?: string;
  extra?: Record<string, unknown>;
};

export type StrategyResult = {
  name: string;
  status: "idle" | "running" | "done" | "error";
  intent?: string;
  answer?: string;
  sources?: Source[];
  metrics?: Metrics;
  error?: string;
};

type State = Record<string, StrategyResult>;

const STRATEGY_ORDER = [
  "baseline",
  "hybrid",
  "rerank",
  "query_rewrite",
  "multi_query",
  "hyde",
] as const;

const STRATEGY_LABELS: Record<string, { label: string; tone: string }> = {
  baseline: { label: "Baseline", tone: "neutral" },
  hybrid: { label: "Hybrid BM25", tone: "green" },
  rerank: { label: "Rerank LLM", tone: "purple" },
  query_rewrite: { label: "Query Rewrite", tone: "orange" },
  multi_query: { label: "Multi Query", tone: "teal" },
  hyde: { label: "HyDe", tone: "red" },
};

function makeEmptyState(): State {
  const s: State = {};
  for (const name of STRATEGY_ORDER) {
    s[name] = { name, status: "idle" };
  }
  return s;
}

function makeRunningState(): State {
  const s: State = {};
  for (const name of STRATEGY_ORDER) {
    s[name] = { name, status: "running" };
  }
  return s;
}

/**
 * @deprecated — usar StrategyCard (lab) + /dev stream. Este panel es legacy non-stream.
 */
export function ComparePanel({
  question,
  history,
  k = 6,
}: {
  question: string | null;
  history?: { role: string; content: string }[];
  k?: number;
}) {
  const [state, setState] = useState<State>(makeEmptyState());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    console.warn("[ComparePanel] deprecated — usa StrategyCard + /dev sse");
    if (!question) return;
    setState(makeRunningState());
    setExpanded(null);

    (async () => {
      try {
        const res = await fetch("/api/proxy/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history, k }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const strategies = data.strategies as Record<
          string,
          {
            intent?: string;
            answer?: string;
            sources?: Source[];
            metrics?: Metrics;
          }
        >;
        const newState: State = {};
        for (const name of STRATEGY_ORDER) {
          const payload = strategies[name];
          if (!payload) {
            newState[name] = { name, status: "error", error: "no devuelto" };
            continue;
          }
          const hasError = Boolean(payload.metrics?.error);
          newState[name] = {
            name,
            status: hasError ? "error" : "done",
            intent: payload.intent,
            answer: payload.answer,
            sources: payload.sources,
            metrics: payload.metrics,
            error: payload.metrics?.error,
          };
        }
        setState(newState);
      } catch (e) {
        const err = String(e);
        setState((s) => {
          const ns: State = { ...s };
          for (const k2 of Object.keys(ns)) {
            ns[k2] = { ...ns[k2], status: "error", error: err };
          }
          return ns;
        });
      }
    })();
  }, [question, history, k]);

  return (
    <aside className="compare-panel">
      <div className="compare-header">
        <h2>Comparador de RAG</h2>
        <div className="compare-subtitle">
          6 estrategias en paralelo · misma pregunta, distinto retrieval
        </div>
      </div>
      <div className="compare-grid">
        {STRATEGY_ORDER.map((name) => {
          const card = state[name];
          const meta = STRATEGY_LABELS[name];
          const isExpanded = expanded === name;
          return (
            <div
              key={name}
              className={`compare-card tone-${meta?.tone || "neutral"} status-${card.status}`}
            >
              <div className="card-header">
                <span className="strategy-name">{meta?.label || name}</span>
                {card.intent && card.status === "done" && (
                  <span className="card-intent">{card.intent}</span>
                )}
                {card.status === "running" && (
                  <span className="card-intent muted">corriendo</span>
                )}
                {card.status === "error" && (
                  <span className="card-intent error">error</span>
                )}
              </div>

              {card.status === "idle" && (
                <div className="card-empty">Sin consulta</div>
              )}

              {card.status === "running" && (
                <div className="card-running">
                  <span className="spinner" />
                  <span>Pensando...</span>
                </div>
              )}

              {card.status === "error" && (
                <div className="card-error">
                  {card.error || "Error desconocido"}
                </div>
              )}

              {card.status === "done" && card.metrics && (
                <>
                  <div className="card-answer">
                    {card.answer || "(sin respuesta)"}
                  </div>
                  <div className="card-metrics">
                    <span title="latencia total">
                      ⏱ {Math.round(card.metrics.total_ms)}ms
                    </span>
                    <span title="fuentes recuperadas / unicas">
                      📄 {card.metrics.num_sources}/{card.metrics.distinct_sources}
                    </span>
                    <span title="tokens answerer in/out">
                      🎟 {card.metrics.answerer_input_tokens}+{card.metrics.answerer_output_tokens}
                    </span>
                    {card.metrics.aux_llm_input_tokens +
                      card.metrics.aux_llm_output_tokens >
                      0 && (
                      <span title="tokens LLM auxiliar in/out" className="muted">
                        +{card.metrics.aux_llm_input_tokens}+
                        {card.metrics.aux_llm_output_tokens} aux
                      </span>
                    )}
                  </div>
                  <button
                    className="card-toggle"
                    onClick={() => setExpanded(isExpanded ? null : name)}
                  >
                    {isExpanded ? "Ocultar" : "Ver fuentes"}
                  </button>
                  {isExpanded && card.sources && (
                    <div className="card-sources">
                      {card.sources.slice(0, 4).map((s, j) => (
                        <div key={j} className="source-item">
                          pag. {s.pagina} · {s.seccion}
                          {s.cultivo ? ` · ${s.cultivo}` : ""}
                        </div>
                      ))}
                      {card.sources.length > 4 && (
                        <div className="source-item muted">
                          +{card.sources.length - 4} mas
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
