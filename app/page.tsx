"use client";

import { useState, useRef, useEffect } from "react";
import { ComparePanel } from "./components/ComparePanel";

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
  intent?: string;
  sources?: Source[];
};

const SUGGESTIONS = [
  "Cuanto me sale sembrar soja de primera en zona norte?",
  "Que se proyecta para trigo en la campana 2026/27?",
  "Cual es el margen bruto del maiz tardio?",
  "Cuanto cuesta un kilo de novillo en feedlot?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [compareQuestion, setCompareQuestion] = useState<string | null>(null);
  const [compareHistory, setCompareHistory] = useState<
    { role: string; content: string }[]
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function send(question: string) {
    if (!question.trim() || busy) return;

    // Disparar el comparador en paralelo (con la pregunta actual + history)
    const newHistory = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];
    setCompareQuestion(question);
    setCompareHistory(newHistory);

    // Chat normal
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/proxy/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId }),
      });
      if (!res.ok || !res.body) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Error conectando con el agente." },
        ]);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let agentText = "";
      let agentIntent = "";
      let agentSources: Source[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            try {
              const payload = JSON.parse(data);
              if (currentEvent === "meta" && payload.session_id) {
                setSessionId(payload.session_id);
                agentIntent = payload.intent;
              } else if (currentEvent === "sources" && payload.sources) {
                agentSources = payload.sources;
              } else if (currentEvent === "token" && payload.text) {
                agentText += payload.text;
                setMessages((m) => {
                  const copy = [...m];
                  const last = copy[copy.length - 1];
                  if (last && last.role === "assistant" && !last.intent) {
                    copy[copy.length - 1] = { ...last, content: agentText };
                  } else {
                    copy.push({ role: "assistant", content: agentText });
                  }
                  return copy;
                });
              }
            } catch {}
          }
        }
      }
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            intent: agentIntent,
            sources: agentSources,
          };
        }
        return copy;
      });
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Error de red." },
      ]);
    }
    setBusy(false);
  }

  async function downloadPdf() {
    if (!sessionId) return;
    const res = await fetch("/api/proxy/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agroposta_${sessionId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="layout">
      <main className="chat-pane">
        <header className="header">
          <div>
            <h1>Agroposta</h1>
            <div className="subtitle">
              Consejero agropecuario sobre Margenes Agropecuarios · Edicion
              2026/05
            </div>
          </div>
          <button
            className="download-btn"
            onClick={downloadPdf}
            disabled={!sessionId}
          >
            Descargar PDF
          </button>
        </header>

        <div ref={scrollRef} className="chat-scroll">
          {messages.length === 0 && (
            <div className="empty">
              <p>
                Hola, soy Agroposta. Preguntame sobre costos, margenes,
                precios o lo que necesites de la revista.
              </p>
              <div style={{ marginTop: 20 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="download-btn"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      margin: 4,
                    }}
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="role">
                {m.role === "user" ? "Productor" : "Agroposta"}
              </div>
              {m.intent && <div className="intent-badge">{m.intent}</div>}
              <div>{m.content}</div>
              {m.sources && m.sources.length > 0 && (
                <div className="sources">
                  Fuentes citadas en la revista:
                  <ul>
                    {m.sources.map((s, j) => (
                      <li key={j}>
                        pag. {s.pagina} · seccion {s.seccion}
                        {s.cultivo ? ` · ${s.cultivo}` : ""}
                        {s.campana
                          ? ` · campana ${s.campana.replace("_", "/")}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="message agent">
              <div className="role">Agroposta</div>
              <span className="thinking">Pensando</span>
            </div>
          )}
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="composer-inner">
            <textarea
              rows={2}
              placeholder="Preguntale a Agroposta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Enviar
            </button>
          </div>
        </form>
      </main>

      <ComparePanel
        question={compareQuestion}
        history={compareHistory}
        k={6}
      />
    </div>
  );
}
