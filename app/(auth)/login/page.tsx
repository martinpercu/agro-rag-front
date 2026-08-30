"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <h1>Agroposta — Login</h1>
        <p>Supabase no configurado. Definí NEXT_PUBLIC_SUPABASE_URL y ANON_KEY en .env.local</p>
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
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, border: "1px solid #ddd", borderRadius: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Agroposta — Login</h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>Supabase Auth · magic no, email+password por ahora</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode("signin")} style={{ flex: 1, padding: 8, background: mode === "signin" ? "#111" : "#eee", color: mode === "signin" ? "#fff" : "#111", borderRadius: 8 }}>Sign in</button>
        <button onClick={() => setMode("signup")} style={{ flex: 1, padding: 8, background: mode === "signup" ? "#111" : "#eee", color: mode === "signup" ? "#fff" : "#111", borderRadius: 8 }}>Sign up</button>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }} />
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }} />
        <button type="submit" disabled={loading} style={{ padding: 10, background: "#0ea5e9", color: "#fff", borderRadius: 8, opacity: loading ? 0.6 : 1 }}>
          {loading ? "..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
      {msg && <p style={{ marginTop: 12, color: msg.includes("creada") ? "green" : "crimson" }}>{msg}</p>}
      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }}>Al loguearte se guarda tu sesión y tus investigadas/planes en Postgres Railway.</p>
    </div>
  );
}
