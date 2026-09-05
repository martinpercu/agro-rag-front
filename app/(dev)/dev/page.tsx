"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { StrategyCard, type CardState } from "../../components/StrategyCard";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useAgroSession, getAuthHeader } from "../../hooks/use-agro-session";
import { useTranslations } from "next-intl";

type Lang = "es" | "en";

const STRATEGIES = [
  "baseline",
  "lexical",
  "hybrid",
  "rerank",
  "query_rewrite",
  "multi_query",
  "hyde",
] as const;

type StrategyName = (typeof STRATEGIES)[number];

type HistoryItem = { role: "user" | "assistant"; content: string };

function makeInitialState(): Record<StrategyName, CardState> {
  const s = {} as Record<StrategyName, CardState>;
  for (const name of STRATEGIES) {
    s[name] = { status: "idle", answer: "", sources: [] };
  }
  return s;
}

function makeInitialHistories(): Record<StrategyName, HistoryItem[]> {
  const h = {} as Record<StrategyName, HistoryItem[]>;
  for (const name of STRATEGIES) {
    h[name] = [];
  }
  return h;
}

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "es";
  const v = localStorage.getItem("agroposta_lang");
  return v === "en" || v === "es" ? v : "es";
}
function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return n;
}

export default function DevPage() {
  const [lang, setLang] = useState<Lang>("es");
  const [states, setStates] = useState<Record<StrategyName, CardState>>(makeInitialState);
  const [histories, setHistories] = useState<Record<StrategyName, HistoryItem[]>>(makeInitialHistories);
  const [enabled, setEnabled] = useState<Record<StrategyName, boolean>>(() => {
    const e = {} as Record<StrategyName, boolean>;
    for (const name of STRATEGIES) e[name] = name === "baseline";
    return e;
  });
  const [k, setK] = useState(6);
  const [temperature, setTemperature] = useState(0.2);
  const [semBm25, setSemBm25] = useState(20);
  const [lexBm25, setLexBm25] = useState(20);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { userEmail, isConfigured, signOut } = useAgroSession();

  const busyRef = useRef(false);
  const t = useTranslations("Lab");
  const hydratedRef = useRef(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const vLang = readStoredLang();
    if (vLang !== lang) setLang(vLang);
    setK(readStoredNumber("agroposta_k", 6, 1, 16));
    setTemperature(readStoredNumber("agroposta_temp", 0.2, 0, 1));
    setSemBm25(readStoredNumber("agroposta_sem_bm25", 20, 1, 40));
    setLexBm25(readStoredNumber("agroposta_lex_bm25", 20, 1, 40));
    hydratedRef.current = true;
  }, []);

  // Keep in sync if another tab or dashboard changes the values
  useEffect(() => {
    function syncFromStorage() {
      if (!hydratedRef.current) return;
      setK(readStoredNumber("agroposta_k", 6, 1, 16));
      setTemperature(readStoredNumber("agroposta_temp", 0.2, 0, 1));
      setSemBm25(readStoredNumber("agroposta_sem_bm25", 20, 1, 40));
      setLexBm25(readStoredNumber("agroposta_lex_bm25", 20, 1, 40));
      setLang(readStoredLang());
    }
    function onStorage(e: StorageEvent) {
      if (
        e.key === "agroposta_k" ||
        e.key === "agroposta_temp" ||
        e.key === "agroposta_sem_bm25" ||
        e.key === "agroposta_lex_bm25" ||
        e.key === "agroposta_lang"
      ) {
        syncFromStorage();
      }
    }
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncFromStorage();
    });
    window.addEventListener("focus", syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", syncFromStorage);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, []);

  // Helpers that persist immediately so dashboard can inherit (no useEffect to avoid mount overwrite)
  function setKAndPersist(v: number) {
    setK(v);
    localStorage.setItem("agroposta_k", String(v));
  }
  function setTempAndPersist(v: number) {
    setTemperature(v);
    localStorage.setItem("agroposta_temp", String(v));
  }
  function setSemAndPersist(v: number) {
    setSemBm25(v);
    localStorage.setItem("agroposta_sem_bm25", String(v));
  }
  function setLexAndPersist(v: number) {
    setLexBm25(v);
    localStorage.setItem("agroposta_lex_bm25", String(v));
  }

  function toggleLang() {
    const next: Lang = lang === "es" ? "en" : "es";
    setLang(next);
    localStorage.setItem("agroposta_lang", next);
    window.dispatchEvent(new Event("agroposta:lang-change"));
  }

  const resetStates = useCallback(() => {
    setStates(makeInitialState());
  }, []);

  async function send(question: string) {
    if (!question.trim() || busyRef.current) return;

    const enabledNames = STRATEGIES.filter((n) => enabled[n]);
    if (enabledNames.length === 0) return;

    busyRef.current = true;
    setBusy(true);
    setInput("");

    setHistories((prev) => {
      const next = { ...prev };
      for (const name of enabledNames) {
        next[name] = [...(prev[name] || []), { role: "user" as const, content: question }];
      }
      return next;
    });

    setStates((prev) => {
      const next = { ...prev };
      for (const name of enabledNames) {
        next[name] = { status: "retrieving", answer: "", sources: [] };
      }
      return next;
    });

    const abortController = new AbortController();

    // Optional Supabase JWT — centralizado via hook
    const authHeader = await getAuthHeader();

    try {
      const res = await fetch(`/api/proxy/compare/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeader },
        body: JSON.stringify({
          question,
          enabled: enabledNames,
          lang,
          k,
          sem_bm25: semBm25,
          lex_bm25: lexBm25,
          temperature,
        }),
        signal: abortController.signal,
        // @ts-ignore Next.js fetch cache
        cache: "no-store" as RequestCache,
      });

      if (!res.ok || !res.body) {
        setStates((prev) => {
          const next = { ...prev };
          for (const name of enabledNames) {
            next[name] = { status: "error", answer: "", sources: [], error: t("errorConexion") };
          }
          return next;
        });
        busyRef.current = false;
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = ""; // keep across chunks — event y data pueden venir separados

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";


        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            try {
              const payload = JSON.parse(data);
              const sName = payload.strategy as StrategyName;

              if (currentEvent === "strategy_retrieve") {
                setStates((prev) => ({
                  ...prev,
                  [sName]: {
                    status: "streaming",
                    intent: payload.intent,
                    answer: "",
                    sources: payload.sources || [],
                    trace: payload.trace || [],
                    retrievalMs: payload.retrieval_ms,
                    numSources: payload.num_sources,
                    distinctSources: payload.distinct_sources,
                  },
                }));
              } else if (currentEvent === "strategy_token") {
                setStates((prev) => {
                  const cur = prev[sName];
                  if (!cur || cur.status !== "streaming") return prev;
                  return {
                    ...prev,
                    [sName]: { ...cur, answer: cur.answer + payload.text },
                  };
                });
              } else if (currentEvent === "strategy_done") {
                setStates((prev) => {
                  const cur = prev[sName];
                  return {
                    ...prev,
                    [sName]: {
                      status: "done",
                      intent: cur?.intent,
                      answer: payload.answer || cur?.answer || "",
                      sources: payload.sources || cur?.sources || [],
                      trace: cur?.trace || [],
                      answererMs: payload.answerer_ms,
                      inputTokens: payload.input_tokens,
                      outputTokens: payload.output_tokens,
                      retrievalMs: cur?.retrievalMs,
                      numSources: cur?.numSources,
                      distinctSources: cur?.distinctSources,
                    },
                  };
                });
                setHistories((prev) => {
                  const next = { ...prev };
                  next[sName] = [
                    ...(prev[sName] || []),
                    { role: "assistant", content: payload.answer || "" },
                  ];
                  return next;
                });
              } else if (currentEvent === "strategy_error") {
                setStates((prev) => ({
                  ...prev,
                  [sName]: {
                    status: "error",
                    answer: "",
                    sources: [],
                    error: payload.error || "Error desconocido",
                  },
                }));
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStates((prev) => {
        const next = { ...prev };
        for (const name of enabledNames) {
          next[name] = { status: "error", answer: "", sources: [], error: t("errorRed") };
        }
        return next;
      });
    }

    busyRef.current = false;
    setBusy(false);
  }

  function toggleStrategy(name: StrategyName) {
    setEnabled((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function clearHistories() {
    setHistories(makeInitialHistories());
    resetStates();
  }

  return (
    <div className="layout-grid builder">
      <header className="grid-header">
        <div>
          <h1>{t("title")}</h1>
          <div className="subtitle">
            {t("subtitle")} — <a href="/" className="text-brand underline underline-offset-2 hover:text-brand-hover">{t("irAlChat")}</a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured ? (
            userEmail ? (
              <>
                <span className="text-small text-muted">{userEmail}</span>
                <button
                  className="ap-btn ap-btn--ghost ap-btn--sm lang-toggle"
                  onClick={signOut}
                >
                  Salir
                </button>
              </>
            ) : (
              <a href="/login" className="ap-btn ap-btn--ghost ap-btn--sm lang-toggle no-underline">
                Entrar
              </a>
            )
          ) : null}
          <ThemeToggle variant="ghost" size="sm" />
          <button className="ap-btn ap-btn--ghost ap-btn--sm lang-toggle" onClick={toggleLang}>
            {lang === "es" ? "🇺🇸 EN" : "🇪🇸 ES"}
          </button>
          <button className="ap-btn ap-btn--secondary ap-btn--sm download-btn" onClick={clearHistories} disabled={busy}>
            {t("limpiar")}
          </button>
        </div>
      </header>

      <div className="grid-3x2">
        {STRATEGIES.map((name) => (
          <StrategyCard
            key={name}
            name={name}
            lang={lang}
            enabled={enabled[name]}
            onToggle={() => toggleStrategy(name)}
            state={states[name]}
            history={histories[name] || []}
            isStreaming={states[name].status === "streaming" || states[name].status === "retrieving"}
          />
        ))}
      </div>

      <form
        className="composer ap-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="k-row">
          <div className="k-control ap-k-control temp-control">
            <span className="k-label ap-k-label">T°</span>
            <span className="k-value ap-k-value">{temperature.toFixed(1)}</span>
            <div className="k-slider-wrap">
              <span className="k-min">0</span>
              <input
                type="range"
                className="k-slider ap-slider"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTempAndPersist(Number(e.target.value))}
                style={{ "--k-pct": `${temperature * 100}%` } as React.CSSProperties}
              />
              <span className="k-max">1</span>
            </div>
          </div>
          <div className={`k-desc ${k !== 1 ? "invisible" : "visible"}`}>{t("kMin")}</div>
          <div className="k-control ap-k-control">
            <span className="k-label ap-k-label">K</span>
            <span className="k-value ap-k-value">{k}</span>
            <div className="k-slider-wrap">
              <span className="k-min">1</span>
              <input
                type="range"
                className="k-slider ap-slider"
                min={1}
                max={16}
                value={k}
                onChange={(e) => setKAndPersist(Number(e.target.value))}
                style={{ "--k-pct": `${((k - 1) / 15) * 100}%` } as React.CSSProperties}
              />
              <span className="k-max">16</span>
            </div>
          </div>
          <div className={`k-desc ${k !== 16 ? "invisible" : "visible"}`}>{t("kMax")}</div>
          <div className="branch-inputs">
            <label className="branch-field ap-branch-field">
              <span>Sem-BM25</span>
              <input
                type="number"
                min={1}
                max={40}
                value={semBm25}
                onChange={(e) =>
                  setSemAndPersist(Math.min(40, Math.max(1, Number(e.target.value) || 20)))
                }
              />
            </label>
            <label className="branch-field ap-branch-field">
              <span>Lex-BM25</span>
              <input
                type="number"
                min={1}
                max={40}
                value={lexBm25}
                onChange={(e) =>
                  setLexAndPersist(Math.min(40, Math.max(1, Number(e.target.value) || 20)))
                }
              />
            </label>
          </div>
        </div>

        <div className="composer-inner ap-composer__inner">
          <textarea
            rows={2}
            placeholder={t("placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={busy}
            className="ap-textarea"
          />
          <button type="submit" disabled={busy || !input.trim()} className="ap-btn ap-btn--primary">
            {busy ? t("procesando") : t("enviar")}
          </button>
        </div>
      </form>
    </div>
  );
}
