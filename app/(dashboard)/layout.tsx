"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, FlaskConical, ClipboardList, TestTube, Pin, Bell, Sprout, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useIconSize } from "../hooks/use-icon-size";
import { useAgroSession } from "../hooks/use-agro-session";
import { useInvestigations } from "../hooks/use-investigations";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userEmail, isConfigured, signOut } = useAgroSession();
  const { investigations, loading: investigationsLoading } = useInvestigations(userEmail);
  const iconBtn = useIconSize("button");

  const SidebarContent = (
    <>
      <div className="sidebar-top">
        <Link href="/" className="sidebar-logo flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <span className="sidebar-logo-mark flex items-center justify-center rounded-lg bg-brand text-white w-7 h-7">
            <Sprout size={16} strokeWidth={1.7} />
          </span>
          Agroposta
        </Link>
        <span className="sidebar-edition">2026/05</span>
      </div>

      <nav className="sidebar-nav">
        <Link href="/" className="sidebar-link active" onClick={() => setMobileOpen(false)}>
          <span className="sidebar-link-icon flex items-center justify-center">
            <MessageSquare size={iconBtn} strokeWidth={1.5} />
          </span>{" "}
          Chat
        </Link>
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span className="sidebar-link-icon flex items-center justify-center">
              <FlaskConical size={14} strokeWidth={1.5} />
            </span>{" "}
            Mis investigadas
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
          <span className="sidebar-link-icon flex items-center justify-center">
            <ClipboardList size={iconBtn} strokeWidth={1.5} />
          </span>{" "}
          Mis planes
          <span className="sidebar-badge">pronto</span>
        </a>
        <Link href="/dev" className="sidebar-link" onClick={() => setMobileOpen(false)}>
          <span className="sidebar-link-icon flex items-center justify-center">
            <TestTube size={iconBtn} strokeWidth={1.5} />
          </span>{" "}
          Lab /dev
          <span className="sidebar-badge lab">lab</span>
        </Link>
      </nav>

      <div className="sidebar-bottom">
        {isConfigured ? (
          userEmail ? (
            <div className="sidebar-user">
              <span className="sidebar-user-email" title={userEmail}>
                {userEmail}
              </span>
              <button className="sidebar-btn" onClick={signOut}>
                Salir
              </button>
            </div>
          ) : (
            <Link href="/login" className="sidebar-btn primary" onClick={() => setMobileOpen(false)}>
              Entrar
            </Link>
          )
        ) : (
          <span className="sidebar-hint">Supabase no configurado</span>
        )}
        <div className="sidebar-footnote">Baseline only en prod · k/temp desde /dev</div>
      </div>
    </>
  );

  return (
    <div className="dashboard-root client bg-base">
      {/* Desktop sidebar 280 — hidden on mobile */}
      <aside className="dashboard-sidebar bg-surface border-r border-border hidden lg:flex lg:flex-col">{SidebarContent}</aside>

      {/* Mobile top bar — visible <1024 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
        <button
          onClick={() => setMobileOpen(true)}
          className="ap-btn ap-btn--ghost ap-btn--sm"
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
          <span className="flex items-center justify-center rounded-lg bg-brand text-white w-7 h-7">
            <Sprout size={16} strokeWidth={1.7} />
          </span>
          Agroposta
        </Link>
        <span className="ml-auto ap-badge--edition">2026/05</span>
      </div>

      {/* Mobile sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-surface border-r border-border flex flex-col p-4 overflow-y-auto lg:hidden"
            >
              <div className="flex justify-end mb-2">
                <button onClick={() => setMobileOpen(false)} className="ap-btn ap-btn--ghost ap-btn--sm" aria-label="Cerrar">
                  <X size={16} />
                </button>
              </div>
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Center 760 */}
      <main className="dashboard-center bg-base pt-12 lg:pt-0">{children}</main>

      {/* Right 56 → 340 — motion width como Odoo pinned-sidebar — hidden on mobile */}
      <motion.aside
        className={`dashboard-right ${rightOpen ? "open" : "collapsed"} hidden lg:flex`}
        animate={{ width: rightOpen ? 340 : 56 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: rightOpen ? 340 : 56 }}
      >
        <div className="right-icons">
          <button
            className="right-icon-btn"
            title={rightOpen ? "Cerrar panel" : "Pins"}
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle pins"
          >
            <Pin size={18} strokeWidth={1.5} />
          </button>
          <button
            className="right-icon-btn"
            title="Notificaciones"
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Toggle notifications"
          >
            <Bell size={18} strokeWidth={1.5} />
          </button>
        </div>
        <AnimatePresence>
          {rightOpen && (
            <motion.div
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="right-panel-content"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </div>
  );
}
