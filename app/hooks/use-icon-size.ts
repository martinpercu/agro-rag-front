"use client";

import { useEffect, useState } from "react";

/**
 * useIconSize — density-aware icon sizing (espejo Odoo hooks/use-icon-size.ts)
 * .builder (lab /dev) → 16px, .client (producto /) → 18px, small inline → 14px
 * Lee DOM para detectar density sin prop-drilling; funciona con html o wrapper builder/client.
 */
export function useIconSize(kind: "button" | "inline" | "small" = "button"): number {
  const [size, setSize] = useState(() => {
    if (typeof window === "undefined") return 18;
    // SSR fallback: detect por ruta si existe
    const isDev = window.location.pathname.startsWith("/dev");
    if (kind === "small") return 14;
    return isDev ? 16 : 18;
  });

  useEffect(() => {
    function compute() {
      const hasBuilder =
        document.documentElement.classList.contains("builder") ||
        !!document.querySelector(".builder");
      const hasClient =
        document.documentElement.classList.contains("client") ||
        !!document.querySelector(".client");

      if (kind === "small") {
        setSize(14);
        return;
      }
      if (hasBuilder && !hasClient) {
        setSize(16);
      } else if (hasClient) {
        setSize(18);
      } else {
        // fallback por ruta
        const isDev = window.location.pathname.startsWith("/dev");
        setSize(isDev ? 16 : 18);
      }
    }

    compute();

    const observer = new MutationObserver(compute);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });

    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [kind]);

  return size;
}
