"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { MessageList, type ChatMessage } from "../components/MessageList";
import { Composer } from "../components/Composer";
import { ThemeToggle } from "../components/ThemeToggle";

type Lang = "es" | "en";

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "es";
  const v = localStorage.getItem("agroposta_lang");
  return v === "en" || v === "es" ? (v as Lang) : "es";
}
function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return n;
}

export default function DashboardPage() {
  const [lang, setLang] = useState<Lang>("es");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // inherited from /dev via localStorage — hydrate after mount to avoid SSR mismatch
  const [k, setK] = useState(6);
  const [temperature, setTemperature] = useState(0.2);
  const [semBm25, setSemBm25] = useState(20);
  const [lexBm25, setLexBm25] = useState(20);
  const busyRef = useRef(false);
  const hydratedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // hydrate from localStorage
    setLang(readStoredLang());
    setK(readStoredNumber("agroposta_k", 6, 1, 16));
    setTemperature(readStoredNumber("agroposta_temp", 0.2, 0, 1));
    setSemBm25(readStoredNumber("agroposta_sem_bm25", 20, 1, 40));
    setLexBm25(readStoredNumber("agroposta_lex_bm25", 20, 1, 40));
    const savedMsgs = localStorage.getItem("agroposta_dashboard_msgs");
    if (savedMsgs) {
      try {
        const parsed = JSON.parse(savedMsgs) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed.slice(-30));
      } catch {}
    }
    hydratedRef.current = true;
  }, []);

  // Keep k/temp in sync when /dev changes them (storage event + focus/visibility)
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
    const onVis = () => {
      if (document.visibilityState === "visible") syncFromStorage();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", syncFromStorage);
    };
  }, []);

  // persist messages locally (ephemeral until PostgresSaver) — debounced & not during streaming
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.some((m) => m.streaming)) return; // don't persist mid-stream
    const id = setTimeout(() => {
      const toSave = messages.filter((m) => !m.streaming);
      try {
        localStorage.setItem("agroposta_dashboard_msgs", JSON.stringify(toSave.slice(-30)));
      } catch {}
    }, 300);
    return () => clearTimeout(id);
  }, [messages]);

  function toggleLang() {
    const next: Lang = lang === "es" ? "en" : "es";
    setLang(next);
    localStorage.setItem("agroposta_lang", next);
  }

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("agroposta_dashboard_msgs");
  }, []);

  async function send(question: string) {
    if (!question.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    const assistantId = `a-${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);

    // history for backend: use ref to avoid stale closure
    const history = [...messagesRef.current, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let authHeader: Record<string, string> = {};
    if (isSupabaseConfigured() && supabase) {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 800)
        );
        const { data } = (await Promise.race([sessionPromise, timeoutPromise])) as Awaited<typeof sessionPromise>;
        if ((data as unknown as { session?: { access_token?: string } })?.session?.access_token) {
          authHeader = { Authorization: `Bearer ${(data as unknown as { session: { access_token: string } }).session.access_token}` };
        }
      } catch {}
    }

    try {
      const res = await fetch(`/api/proxy/compare/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeader },
        body: JSON.stringify({
          question,
          enabled: ["baseline"],
          history: history.slice(-10),
          lang,
          k,
          sem_bm25: semBm25,
          lex_bm25: lexBm25,
          temperature,
        }),
        // @ts-ignore Next.js fetch cache
        cache: "no-store" as RequestCache,
      });

      if (!res.ok || !res.body) {
        const errText = lang === "en" ? "Connection error" : "Error de conexión";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, error: errText, content: "" } : m
          )
        );
        busyRef.current = false;
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accAnswer = "";
      let intent: string | undefined;
      let sources: ChatMessage["sources"] = [];
      let trace: ChatMessage["trace"] = [];
      let currentEvent = ""; // keep across chunks (split could separate event/data)

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
            if (!data) continue;
            try {
              const payload = JSON.parse(data);
              // dashboard only cares about baseline strategy events
              const strat = payload.strategy as string | undefined;
              if (strat && strat !== "baseline") continue;

              if (currentEvent === "strategy_retrieve") {
                intent = payload.intent;
                sources = payload.sources || [];
                trace = payload.trace || [];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, intent, sources, trace, streaming: true } : m
                  )
                );
              } else if (currentEvent === "strategy_token") {
                accAnswer += payload.text || "";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accAnswer, streaming: true } : m
                  )
                );
              } else if (currentEvent === "strategy_done") {
                accAnswer = payload.answer || accAnswer;
                sources = payload.sources || sources;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: accAnswer,
                          sources,
                          trace,
                          intent: intent || m.intent,
                          streaming: false,
                        }
                      : m
                  )
                );
              } else if (currentEvent === "strategy_error") {
                const err = payload.error || "Error desconocido";
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: "", error: err, streaming: false } : m
                  )
                );
              }
            } catch {}
          }
        }
      }

      // finalize if still streaming (no done event but tokens ended)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
      );

      // Save investigacion sutil (Fase 2 baby step1: con divisions si el user mencionó ha/cultivo)
      if (accAnswer && !accAnswer.startsWith("En esta edicion no encontre")) {
        try {
          // Parsear divisions via backend (mismo parser que field_collector) — no bloquea si falla
          let divisions: Array<{ hectares: string; cultivo: string | null }> = [];
          let planIntent = false;
          try {
            const parseRes = await fetch("/api/proxy/plan/parse", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question, history: history.slice(-6) }),
            });
            if (parseRes.ok) {
              const pj = await parseRes.json();
              divisions = pj.divisions || [];
              planIntent = !!pj.plan_intent;
            }
          } catch {}
          let saveAuthHeader: Record<string, string> = {};
          if (isSupabaseConfigured() && supabase) {
            const { data } = await supabase.auth.getSession();
            if (data.session?.access_token) saveAuthHeader = { Authorization: `Bearer ${data.session.access_token}` };
          }
          await fetch("/api/proxy/investigations", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...saveAuthHeader },
            body: JSON.stringify({
              query: question,
              edition_id: "2026_05",
              divisions: divisions.length ? divisions : undefined,
              location: {},
              metadata: { k, temperature, sem_bm25: semBm25, lex_bm25: lexBm25, lang, intent, plan_intent: planIntent },
            }),
          });
          localStorage.setItem("agroposta_investigation_saved", String(Date.now()));
          window.dispatchEvent(new Event("agroposta:investigation-saved"));
        } catch {}
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isAbort = (e as Error).name === "AbortError";
      if (!isAbort) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, error: msg || "Network error", content: "" } : m
          )
        );
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-chat">
      <div className="dashboard-chat-header">
        <div className="chat-header-left">
          <h1 className="chat-title">Chat</h1>
          <span className="chat-subtitle" suppressHydrationWarning>
            {lang === "en" ? "Margenes 2026/05 · baseline" : "Márgenes 2026/05 · baseline"} · k={k} T={temperature.toFixed(1)} · Sem{semBm25} Lex{lexBm25}
            <a
              href="/dev"
              className="ml-2 text-[11px] text-brand underline underline-offset-2 hover:text-brand-hover"
              title="Editar k/temp en /dev"
            >
              {lang === "en" ? "(edit in /dev)" : "(editar en /dev)"}
            </a>
          </span>
        </div>
        <div className="chat-header-right">
          <ThemeToggle variant="ghost" size="sm" />
          <button className="lang-toggle" onClick={toggleLang} title="Cambiar idioma">
            {lang === "es" ? "🇺🇸 EN" : "🇪🇸 ES"}
          </button>
          <button className="download-btn" onClick={clearChat} disabled={busy || messages.length === 0}>
            {lang === "en" ? "Clear" : "Limpiar"}
          </button>
        </div>
      </div>

      <MessageList messages={messages} lang={lang} />

      <Composer onSend={send} disabled={busy} lang={lang} />
    </div>
  );
}
