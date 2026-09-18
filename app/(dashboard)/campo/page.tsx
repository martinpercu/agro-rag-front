"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { Feature, FeatureCollection, Position } from "geojson";
import { getAuthHeader, useAgroSession } from "../../hooks/use-agro-session";
import { useInvestigations } from "../../hooks/use-investigations";

const FieldDrawMap = dynamic(() => import("../../components/FieldDrawMap"), {
  ssr: false,
  loading: () => <div className="text-sm opacity-60">…</div>,
});

type Bucket = {
  date_from: string;
  date_to: string;
  ndvi_mean: number | null;
  ndvi_min: number | null;
  ndvi_max: number | null;
  sample_count: number;
  empty: boolean;
};

type NdviResult = {
  series: Bucket[];
  polygon: unknown;
  centroid: { lat: number; lng: number };
  area_ha: number;
  origin: { mode: string };
  aggregation: string;
  cached: boolean;
};

type Lang = "es" | "en";

function shortDate(iso: string): string {
  return (iso || "").slice(0, 10);
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Convierte el `location` guardado de una investigada a Feature GeoJSON (o null si no es mapeable). */
function locationToFeature(
  loc: Record<string, unknown> | null | undefined,
  props: Record<string, string>
): Feature | null {
  if (!loc || typeof loc !== "object") return null;
  try {
    if ("polygon" in loc && loc.polygon && typeof loc.polygon === "object") {
      const g = loc.polygon as { type?: unknown; coordinates?: unknown };
      if ((g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates)) {
        return { type: "Feature", properties: props, geometry: g as Feature["geometry"] };
      }
    }
    if ("vertices" in loc && Array.isArray(loc.vertices)) {
      const ring: Position[] = [];
      for (const v of loc.vertices as Array<{ lat?: unknown; lng?: unknown }>) {
        const la = num(v?.lat);
        const ln = num(v?.lng);
        if (la === null || ln === null) return null;
        ring.push([ln, la]);
      }
      if (ring.length < 3) return null;
      ring.push(ring[0]);
      return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } };
    }
    if ("bbox" in loc && loc.bbox && typeof loc.bbox === "object") {
      const b = loc.bbox as Record<string, unknown>;
      const laMin = num(b.lat_min);
      const laMax = num(b.lat_max);
      const lnMin = num(b.lng_min);
      const lnMax = num(b.lng_max);
      if (laMin === null || laMax === null || lnMin === null || lnMax === null) return null;
      return {
        type: "Feature",
        properties: props,
        geometry: {
          type: "Polygon",
          coordinates: [[[lnMin, laMin], [lnMax, laMin], [lnMax, laMax], [lnMin, laMax], [lnMin, laMin]]],
        },
      };
    }
    const la = num((loc as Record<string, unknown>).lat);
    const ln = num((loc as Record<string, unknown>).lng);
    if (la !== null && ln !== null) {
      // Punto + radio: círculo aproximado con 24 lados (r desde ha)
      const ha = num((loc as Record<string, unknown>).ha) ?? 5;
      const rM = Math.sqrt(Math.max(ha, 0.1) * 10000 / Math.PI);
      const ring: Position[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * 2 * Math.PI;
        ring.push([ln + (rM * Math.cos(a)) / (111320 * Math.cos((la * Math.PI) / 180)), la + (rM * Math.sin(a)) / 111320]);
      }
      ring.push(ring[0]);
      return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } };
    }
  } catch {
    return null;
  }
  return null;
}

export default function CampoPage() {
  const t = useTranslations("Campo");
  const [lang, setLang] = useState<Lang>("es");
  const [tab, setTab] = useState<"point" | "manual" | "draw">("point");
  const [lat, setLat] = useState("-34.5");
  const [lng, setLng] = useState("-62.0");
  const [ha, setHa] = useState("5");
  const [verticesText, setVerticesText] = useState("-34.0, -62.0\n-34.0, -61.9\n-33.9, -61.95");
  const [bbox, setBbox] = useState({ latMin: "", latMax: "", lngMin: "", lngMax: "" });
  const [agg, setAgg] = useState("P5D");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<NdviResult | null>(null);
  const [lastLocation, setLastLocation] = useState<Record<string, unknown> | null>(null);
  const [drawnPolygon, setDrawnPolygon] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);
  const { userEmail } = useAgroSession();
  const { investigations } = useInvestigations(userEmail);

  const savedFields: FeatureCollection = useMemo(() => {
    const features: Feature[] = [];
    for (const inv of investigations.slice(0, 20)) {
      const f = locationToFeature(inv.location, {
        title: inv.query || "(sin query)",
        meta: `${inv.edition_id || "2026_05"} · ${inv.created_at ? inv.created_at.slice(0, 10) : ""}`,
      });
      if (f) features.push(f);
    }
    return { type: "FeatureCollection", features };
  }, [investigations]);

  useEffect(() => {
    const stored = localStorage.getItem("agroposta_lang");
    if (stored === "en" || stored === "es") setLang(stored);
  }, []);
  const tx = (key: string): string => {
    if (lang === "en") {
      const v = t(`${key}En`);
      if (typeof v === "string" && !v.includes(".")) return v;
    }
    return t(key);
  };

  function buildLocation(): Record<string, unknown> {
    if (tab === "point") {
      return { lat: Number(lat), lng: Number(lng), ha: Number(ha) };
    }
    const { latMin, latMax, lngMin, lngMax } = bbox;
    if (latMin && latMax && lngMin && lngMax) {
      return {
        bbox: {
          lat_min: Number(latMin),
          lat_max: Number(latMax),
          lng_min: Number(lngMin),
          lng_max: Number(lngMax),
        },
      };
    }
    const vertices = verticesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [a, b] = l.split(",").map((x) => Number(x.trim()));
        return { lat: a, lng: b };
      });
    return { vertices };
  }

  async function fetchNdvi(locationOverride?: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const location = locationOverride ?? buildLocation();
      const res = await fetch("/api/proxy/satellite/ndvi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          date_from: from || undefined,
          date_to: to || undefined,
          aggregation: agg,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`);
      setResult(j as NdviResult);
      setLastLocation(location);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function saveInvestigation() {
    if (!result || !lastLocation) return;
    setError("");
    try {
      const auth = await getAuthHeader();
      const res = await fetch("/api/proxy/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          query: `${t("queryLabel")} (${result.area_ha.toFixed(1)} ha)`,
          edition_id: "2026_05",
          location: lastLocation,
          metadata: { source: "satellite", aggregation: result.aggregation },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      window.dispatchEvent(new Event("agroposta:investigation-saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="dashboard-chat">
      <div className="dashboard-chat-header">
        <div className="chat-header-left">
          <h1 className="chat-title">{t("title")}</h1>
          <span className="chat-subtitle">{t("subtitle")}</span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto w-full px-4 pb-24 flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          {(["point", "manual", "draw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTab(m)}
              className={`ap-btn ${tab === m ? "" : "ap-btn--ghost"}`}
            >
              {tx(m === "point" ? "tabPoint" : m === "manual" ? "tabManual" : "tabDraw")}
            </button>
          ))}
        </div>

        {tab === "draw" ? (
          <div className="flex flex-col gap-3">
            <FieldDrawMap
              center={[Number(lat) || -34.5, Number(lng) || -62.0]}
              onPolygon={setDrawnPolygon}
              saved={savedFields}
              t={t}
            />
            <div>
              <button
                onClick={() => drawnPolygon && fetchNdvi({ polygon: drawnPolygon })}
                disabled={loading || !drawnPolygon}
                className="ap-btn ap-btn--primary"
              >
                {loading ? t("fetching") : t("drawUse")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {tab === "point" ? (
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {t("lat")}
              <input className="ap-input" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("lng")}
              <input className="ap-input" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("ha")}
              <input
                className="ap-input"
                value={ha}
                onChange={(e) => setHa(e.target.value)}
                inputMode="decimal"
                min={1}
                max={20}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {t("verticesLabel")}
              <textarea
                className="ap-input font-mono"
                rows={4}
                value={verticesText}
                onChange={(e) => setVerticesText(e.target.value)}
              />
            </label>
            <div className="text-sm opacity-70">{t("bboxTitle")}</div>
            <div className="grid grid-cols-4 gap-3">
              {(["latMin", "latMax", "lngMin", "lngMax"] as const).map((k) => (
                <input
                  key={k}
                  className="ap-input"
                  placeholder={k}
                  value={bbox[k]}
                  onChange={(e) => setBbox({ ...bbox, [k]: e.target.value })}
                  inputMode="decimal"
                />
              ))}
            </div>
          </div>
        )}
          </>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("aggregation")}
            <select className="ap-input" value={agg} onChange={(e) => setAgg(e.target.value)}>
              <option value="P5D">P5D</option>
              <option value="P1D">P1D</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("from")}
            <input className="ap-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("to")}
            <input className="ap-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div>
          <button onClick={() => fetchNdvi()} disabled={loading} className="ap-btn ap-btn--primary">
            {loading ? t("fetching") : t("fetch")}
          </button>
        </div>

        {error && <div className="text-sm text-red-600 dark:text-red-400">⚠ {error}</div>}

        {result && (
          <div className="flex flex-col gap-3">
            <div className="text-sm opacity-80">
              {result.area_ha.toFixed(1)} ha · {result.centroid.lat.toFixed(4)}, {result.centroid.lng.toFixed(4)} ·{" "}
              {result.aggregation} · {result.cached ? t("cached") : t("live")}
            </div>
            <table className="text-sm w-full">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-1 pr-2">{t("tableDate")}</th>
                  <th className="py-1 pr-2">{t("tableMean")}</th>
                  <th className="py-1 pr-2">{t("tableRange")}</th>
                  <th className="py-1 pr-2">{t("tableSamples")}</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.series.map((b) => (
                  <tr key={b.date_from} className="border-t border-black/10 dark:border-white/10">
                    <td className="py-1 pr-2">
                      {shortDate(b.date_from)} → {shortDate(b.date_to)}
                    </td>
                    <td className="py-1 pr-2">
                      {b.ndvi_mean === null ? (
                        <span className="opacity-60">☁ {t("cloudy")}</span>
                      ) : (
                        <>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                            style={{
                              backgroundColor:
                                b.ndvi_mean > 0.6 ? "#0f540c" : b.ndvi_mean > 0.4 ? "#4f8a2e" : b.ndvi_mean > 0.2 ? "#91bf52" : "#c0392b",
                            }}
                          />
                          {b.ndvi_mean.toFixed(3)}
                        </>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      {b.ndvi_min === null ? "—" : `${b.ndvi_min.toFixed(2)}–${(b.ndvi_max ?? 0).toFixed(2)}`}
                    </td>
                    <td className="py-1 pr-2">{b.sample_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <button onClick={saveInvestigation} className="ap-btn">
                {t("save")}
              </button>
              {saved && <span className="ml-2 text-sm text-green-700 dark:text-green-400">✓ {t("saved")}</span>}
            </div>
            <div className="text-xs opacity-60">ⓘ {t("disclaimer")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
