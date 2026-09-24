"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageList, type ChatMessage } from "../components/MessageList";
import { Composer } from "../components/Composer";
import { ThemeToggle } from "../components/ThemeToggle";
import { getAuthHeader } from "../hooks/use-agro-session";
import { useTranslations } from "next-intl";

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

// Prefijos de "no encontré" del backend (answerer.py NO_ANSWER_ES/EN).
// Deben matchear exacto: si cambian allá, cambiar acá en la misma rama.
const NO_ANSWER_PREFIXES = ["En esta edicion no encontre", "I didn't find"];

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
  const tChat = useTranslations("Chat");
  const tSidebar = useTranslations("Sidebar");
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
    window.dispatchEvent(new Event("agroposta:lang-change"));
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

    const authHeader = await getAuthHeader();

    // primario: grafo con streaming (POST /chat/stream, eventos chat_*)
    // fallback: baseline del comparador si el backend no conoce /chat/stream (404)
    let accAnswer = "";
    let intent: string | undefined;
    let sources: ChatMessage["sources"] = [];
    let trace: ChatMessage["trace"] = [];
    let divisions: Array<{ hectares: string; cultivo: string | null }> = [];
    let planIntent = false;

    function applyAssistant(patch: Partial<ChatMessage>) {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    }
    function failAssistant(msg: string) {
      applyAssistant({ streaming: false, error: msg, content: "" });
    }

    async function streamFrom(
      url: string,
      body: Record<string, unknown>,
      onEvent: (event: string, payload: any) => void
    ): Promise<"done" | "fallback" | "error"> {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeader },
          body: JSON.stringify(body),
          // @ts-ignore Next.js fetch cache
          cache: "no-store" as RequestCache,
        });
      } catch {
        return "error";
      }
      if (res.status === 404) return "fallback";
      if (!res.ok || !res.body) return "error";

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
              onEvent(currentEvent, JSON.parse(data));
            } catch {}
          }
        }
      }
      return "done";
    }

    try {
      const chatOutcome = await streamFrom(
        `/api/proxy/chat/stream`,
        {
          question,
          history: history.slice(-10),
          lang,
          k,
          temperature,
        },
        (event, payload) => {
          if (event === "chat_meta") {
            intent = payload.intent;
            sources = payload.sources || [];
            divisions = payload.divisions || [];
            planIntent = !!payload.plan_intent;
            applyAssistant({ intent, sources, streaming: true });
          } else if (event === "chat_token") {
            accAnswer += payload.text || "";
            applyAssistant({ content: accAnswer, streaming: true });
          } else if (event === "chat_done") {
            accAnswer = payload.answer || accAnswer;
            sources = payload.sources || sources;
            divisions = payload.divisions || divisions;
            if (payload.plan_intent !== undefined) planIntent = !!payload.plan_intent;
            if (payload.intent) intent = payload.intent;
            applyAssistant({ content: accAnswer, sources, intent, streaming: false });
          } else if (event === "chat_error") {
            failAssistant(payload.error || tChat("errorUnknown"));
          }
        }
      );

      if (chatOutcome === "fallback") {
        // backend viejo: reintenta con baseline del comparador (eventos strategy_*)
        accAnswer = "";
        intent = undefined;
        sources = [];
        trace = [];
        divisions = [];
        planIntent = false;
        const fbOutcome = await streamFrom(
          `/api/proxy/compare/stream`,
          {
            question,
            enabled: ["baseline"],
            history: history.slice(-10),
            lang,
            k,
            sem_bm25: semBm25,
            lex_bm25: lexBm25,
            temperature,
          },
          (event, payload) => {
            // dashboard only cares about baseline strategy events
            const strat = payload.strategy as string | undefined;
            if (strat && strat !== "baseline") return;

            if (event === "strategy_retrieve") {
              intent = payload.intent;
              sources = payload.sources || [];
              trace = payload.trace || [];
              applyAssistant({ intent, sources, trace, streaming: true });
            } else if (event === "strategy_token") {
              accAnswer += payload.text || "";
              applyAssistant({ content: accAnswer, streaming: true });
            } else if (event === "strategy_done") {
              accAnswer = payload.answer || accAnswer;
              sources = payload.sources || sources;
              applyAssistant({ content: accAnswer, sources, trace, intent, streaming: false });
            } else if (event === "strategy_error") {
              failAssistant(payload.error || tChat("errorUnknown"));
            }
          }
        );
        if (fbOutcome !== "done") {
          failAssistant(tChat("errorConnection"));
          busyRef.current = false;
          setBusy(false);
          return;
        }
      } else if (chatOutcome === "error") {
        failAssistant(tChat("errorConnection"));
        busyRef.current = false;
        setBusy(false);
        return;
      }

      // finalize if still streaming (no done event but tokens ended)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
      );

      // Save investigacion sutil (divisions/planIntent ya vienen del grafo en chat_meta;
      // si vinieron vacios — fallback baseline — se parsean via /plan/parse como antes)
      if (accAnswer && !NO_ANSWER_PREFIXES.some((p) => accAnswer.startsWith(p))) {
        try {
          if (!divisions.length && !planIntent) {
            // Parsear divisions via backend (mismo parser que field_collector) — no bloquea si falla
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
          }
          const saveAuthHeader = await getAuthHeader();
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
            m.id === assistantId ? { ...m, streaming: false, error: msg || tChat("errorConnection"), content: "" } : m
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
          <h1 className="chat-title">{tChat("title")}</h1>
          <span className="chat-subtitle">
            {tChat("subtitle")}
            <a
              href="/dev"
              className="ml-2 text-xs text-brand underline underline-offset-2 hover:text-brand-hover"
              title={tChat("editInDev")}
            >
              {tChat("editInDev")}
            </a>
          </span>
        </div>
        <div className="chat-header-right">
          <ThemeToggle variant="ghost" size="md" />
          <button
            className="ap-btn ap-btn--ghost ap-btn--md lang-toggle"
            onClick={toggleLang}
            aria-pressed={lang === "en"}
            title={tSidebar("langToggle")}
          >
            {lang === "es" ? "EN" : "ES"}
          </button>
          {messages.length > 0 && (
            <button className="ap-btn ap-btn--secondary ap-btn--md download-btn" onClick={clearChat} disabled={busy}>
              {tChat("clear")}
            </button>
          )}
        </div>
      </div>

      <MessageList messages={messages} lang={lang} onExample={send} />

      <Composer onSend={send} disabled={busy} lang={lang} />
    </div>
  );
}
