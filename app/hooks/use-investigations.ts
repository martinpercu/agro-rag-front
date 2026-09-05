"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getAuthHeader } from "./use-agro-session";

export type Investigation = {
  id: string;
  query: string | null;
  edition_id: string | null;
  created_at: string | null;
  divisions?: Array<{ hectares: string; cultivo: string | null }>;
  location?: Record<string, unknown> | null;
};

/**
 * useInvestigations — centraliza fetch + storage/visibility sync (espejo Odoo usePinnedInsights)
 * Reemplaza duplicación en DashboardLayout (51L) + futuro uso en /dev.
 */
export function useInvestigations(userEmail: string | null) {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInvestigations = useCallback(async () => {
    setLoading(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/proxy/investigations", { headers: authHeader });
      if (res.ok) {
        const j = await res.json();
        setInvestigations(j.investigations || []);
      }
    } catch {}
    setLoading(false);
  }, []);

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
  }, [userEmail, fetchInvestigations]);

  return { investigations, loading, fetchInvestigations, setInvestigations };
}
