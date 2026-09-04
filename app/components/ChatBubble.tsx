"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export function ChatBubble({
  role,
  content,
  streaming,
  intent,
  sources,
  trace,
  lang,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  intent?: string;
  sources?: Source[];
  trace?: TraceStep[];
  lang?: "es" | "en";
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="bubble-row user">
        <div className="ap-bubble ap-bubble--user bubble user">
          <div className="bubble-text">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bubble-row assistant">
      <div className={`ap-bubble ap-bubble--assistant bubble assistant ${trace || sources ? "" : ""}`}>
        {intent && <span className="ap-badge--intent bubble-intent">{intent}</span>}
        <div className="bubble-text markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {streaming && <span className="cursor-blink">▌</span>}
        </div>
        {sources && sources.length > 0 && (
          <SourcesBlock sources={sources} lang={lang} />
        )}
        {trace && trace.length > 0 && <TraceBlock trace={trace} />}
      </div>
    </div>
  );
}

function SourcesBlock({ sources, lang }: { sources: Source[]; lang?: string }) {
  return (
    <details className="bubble-sources">
      <summary>
        {lang === "en" ? "View sources" : "Ver fuentes"} · {sources.length}
      </summary>
      <div className="bubble-sources-list">
        {sources.slice(0, 6).map((s, i) => (
          <div key={i} className="bubble-source-item">
            <span>
              pág. {s.pagina} · {s.seccion}
              {s.cultivo ? ` · ${s.cultivo}` : ""}
            </span>
            <span className="bubble-source-score">{(s.score ?? 0).toFixed(3)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function TraceBlock({ trace }: { trace: TraceStep[] }) {
  return (
    <details className="bubble-trace">
      <summary>Trace · {trace.length}</summary>
      <div className="bubble-trace-list">
        {trace.map((t, i) => (
          <div key={i} className="trace-item">
            <div className="trace-row">
              <span className="trace-step">{t.step}</span>
              <span className="trace-ms">{Math.round(t.ms)}ms</span>
              <span className="trace-acc">acc {Math.round(t.acc_ms)}ms</span>
            </div>
            {t.detail && <div className="trace-detail">{t.detail}</div>}
          </div>
        ))}
      </div>
    </details>
  );
}
