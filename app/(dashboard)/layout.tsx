"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

type Investigation = {
  id: string;
  query: string | null;
  edition_id: string | null;
  created_at: string | null;
  divisions?: Array<{ hectares: string; cultivo: string | null }>;
  location?: Record<string, unknown> | null;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [rightOpen, setRightOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [investigationsLoading, setInvestigationsLoading] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured() && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUserEmail(data.session?.user?.email ?? null);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
        setUserEmail(sess?.user?.email ?? null)
      );
      return () => sub.subscription.unsubscribe();
    }
  }, []);

  const fetchInvestigations = async () => {
    setInvestigationsLoading(true);
    try {
      let authHeader: Record<string, string> = {};
      if (isSupabaseConfigured() && supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) authHeader = { Authorization: `Bearer ${data.session.access_token}` };
      }
      const res = await fetch("/api/proxy/investigations", { headers: authHeader });
      if (res.ok) {
        const j = await res.json();
        setInvestigations(j.investigations || []);
      }
    } catch {}
    setInvestigationsLoading(false);
  };

  useEffect(() => {
    fetchInvestigations();
    function onStorage(e: StorageEvent) {
      if (e.key === "agroposta_investigation_saved") fetchInvestigations();
    }
    function onCustom() {
      fetchInvestigations();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("agroposta:investigation-saved" as unknown as string, onCustom);
    window.addEventListener("focus", fetchInvestigations);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("agroposta:investigation-saved" as unknown as string, onCustom);
      window.removeEventListener("focus", fetchInvestigations);
    };
  }, [userEmail]);

  return (
    <div className="dashboard-root client">
      {/* Left sidebar 280 */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-top">
          <Link href="/" className="sidebar-logo">
            <span className="sidebar-logo-mark">◉</span> Agroposta
          </Link>
          <span className="sidebar-edition">2026/05</span>
        </div>

        <nav className="sidebar-nav">
          <Link href="/" className="sidebar-link active">
            <span className="sidebar-link-icon">💬</span> Chat
          </Link>
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span className="sidebar-link-icon">🔬</span> Mis investigadas
              <span className="sidebar-badge">{investigationsLoading ? "…" : investigations.length}</span>
            </div>
            {investigations.length === 0 ? (
              <div className="sidebar-empty">Aún no hay. Hacé una pregunta y se guarda sutil.</div>
            ) : (
              <div className="sidebar-investigations">
                {investigations.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="sidebar-investigation-item" title={inv.query || ""}>
                    <span className="sidebar-investigation-query">{inv.query || "(sin query)"}</span>
                    {inv.divisions && inv.divisions.length > 0 && (
                      <span className="sidebar-investigation-divisions docnum block mt-0.5">
                        {inv.divisions.map((d) => `${d.hectares}ha${d.cultivo ? ` ${d.cultivo}` : ""}`).join(" · ")}
                      </span>
                    )}
                    <span className="sidebar-investigation-meta">
                      {inv.edition_id || "2026_05"} · {inv.created_at ? new Date(inv.created_at).toLocaleDateString("es-AR") : ""}
                    </span>
                  </div>
                ))}
                {investigations.length > 5 && (
                  <span className="sidebar-more">+{investigations.length - 5} más</span>
                )}
              </div>
            )}
          </div>
          <a className="sidebar-link muted" title="Próximamente — Fase 2">
            <span className="sidebar-link-icon">📋</span> Mis planes
            <span className="sidebar-badge">pronto</span>
          </a>
          <Link href="/dev" className="sidebar-link">
            <span className="sidebar-link-icon">🧪</span> Lab /dev
            <span className="sidebar-badge lab">lab</span>
          </Link>
        </nav>

        <div className="sidebar-bottom">
          {isSupabaseConfigured() ? (
            userEmail ? (
              <div className="sidebar-user">
                <span className="sidebar-user-email" title={userEmail}>
                  {userEmail}
                </span>
                <button
                  className="sidebar-btn"
                  onClick={async () => {
                    if (supabase) await supabase.auth.signOut();
                    setUserEmail(null);
                  }}
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link href="/login" className="sidebar-btn primary">
                Entrar
              </Link>
            )
          ) : (
            <span className="sidebar-hint">Supabase no configurado</span>
          )}
          <div className="sidebar-footnote">
            Baseline only en prod · k/temp desde /dev
          </div>
        </div>
      </aside>

      {/* Center 760 */}
      <main className="dashboard-center">{children}</main>

      {/* Right 56 → 340 */}
      <aside className={`dashboard-right ${rightOpen ? "open" : "collapsed"}`}>
        <div className="right-icons">
          <button
            className="right-icon-btn"
            title={rightOpen ? "Cerrar panel" : "Pins"}
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle pins"
          >
            📌
          </button>
          <button
            className="right-icon-btn"
            title="Notificaciones"
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle notifications"
          >
            🔔
          </button>
        </div>
        {rightOpen && (
          <div className="right-panel-content">
            <div className="right-panel-header">
              <strong>Pins &amp; notificaciones</strong>
              <button className="right-close" onClick={() => setRightOpen(false)}>
                ✕
              </button>
            </div>
            {investigations.length === 0 ? (
              <div className="right-panel-empty">
                Aún no hay pins. Cuando guardes una investigada aparecerá acá.
                <br />
                <br />
                <span className="text-small text-muted">
                  Fase 0: se guarda sutil con precio/ubicación opcional.
                </span>
              </div>
            ) : (
              <div className="right-panel-list">
                {investigations.slice(0, 8).map((inv) => (
                  <div key={inv.id} className="right-panel-item">
                    <div className="right-panel-item-query">{inv.query || "(sin query)"}</div>
                    {inv.divisions && inv.divisions.length > 0 && (
                      <div className="right-panel-item-divisions text-small text-muted mt-1">
                        {inv.divisions.map((d) => `${d.hectares}ha${d.cultivo ? ` ${d.cultivo}` : ""}`).join(" · ")}
                      </div>
                    )}
                    <div className="right-panel-item-meta">
                      {inv.edition_id} · {inv.created_at ? new Date(inv.created_at).toLocaleDateString("es-AR") : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
