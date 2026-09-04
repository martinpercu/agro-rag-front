"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

/**
 * useAgroSession — centraliza Supabase auth (espejo Odoo useSession/useAuth)
 * Evita repetir getSession + onAuthStateChange en 3 componentes.
 * Uso: const { userEmail, isConfigured, signOut } = useAgroSession();
 */
export function useAgroSession() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
      setUserEmail(sess?.user?.email ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUserEmail(null);
  }, []);

  return { userEmail, setUserEmail, isConfigured: configured, signOut, supabase };
}

/**
 * useAuthHeader — helper para fetch con Bearer token (evita duplicar timeout 800ms + getSession)
 * DashboardPage tenía timeout race para no bloquear; acá simplificado sin timeout (no crítico en prod)
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured() || !supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return { Authorization: `Bearer ${data.session.access_token}` };
    }
  } catch {}
  return {};
}
