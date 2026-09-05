"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { ThemeToggle } from "../../components/ThemeToggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-[100vh] bg-base flex items-start justify-center px-4 pt-20 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle variant="ghost" size="sm" />
        </div>
        <div className="ap-card w-full max-w-[420px]">
          <div className="ap-card__header">
            <h1 className="text-title">Agroposta — Login</h1>
          </div>
          <div className="ap-card__body">
            <div className="ap-log__empty text-small">
              Supabase no configurado. Definí NEXT_PUBLIC_SUPABASE_URL y ANON_KEY en .env.local
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      if (!supabase) throw new Error("supabase not init");
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Cuenta creada. Revisá tu email si pide confirmación, luego hacé Sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/";
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100vh] bg-base flex items-start justify-center px-4 pt-20 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="ghost" size="sm" />
      </div>
      <div className="ap-card w-full max-w-[420px]">
        <div className="ap-card__header flex flex-col items-start gap-1 border-b border-subtle">
          <h1 className="text-title">Agroposta — Login</h1>
          <p className="text-small text-muted">Supabase Auth · magic no, email+password por ahora</p>
        </div>
        <div className="ap-card__body flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`ap-btn flex-1 ${mode === "signin" ? "ap-btn--primary" : "ap-btn--secondary"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`ap-btn flex-1 ${mode === "signup" ? "ap-btn--primary" : "ap-btn--secondary"}`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              placeholder="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="ap-input"
            />
            <input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="ap-input"
            />
            <button type="submit" disabled={loading} className="ap-btn ap-btn--primary ap-btn--lg ap-btn--block">
              {loading ? "..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          {msg && (
            <div className={`ap-badge ${msg.includes("creada") ? "ap-badge--success" : "ap-badge--error"} w-full justify-center py-2`}>
              {msg}
            </div>
          )}

          <p className="text-small text-muted text-center">
            Al loguearte se guarda tu sesión y tus investigadas/planes en Postgres Railway.
          </p>
        </div>
      </div>
    </div>
  );
}
