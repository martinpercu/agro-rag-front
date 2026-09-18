"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { Feature, FeatureCollection, Position } from "geojson";
import { getAuthHeader, useAgroSession } from "../../hooks/use-agro-session";
import { useInvestigations } from "../../hooks/use-investigations";

const FieldDrawMap = dynamic(() => import("../../components/FieldDrawMap"), {
  ssr: false,
  loading: () => <div className="field-map-skeleton" aria-hidden="true" />,
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

/** Acepta coma decimal ("-34,5") además de punto. */
function parseNum(v: string): number | null {
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Clase del punto NDVI (decorativo: el valor numérico va al lado). */
function ndviClass(v: number): string {
  if (v > 0.6) return "ndvi-4";
  if (v > 0.4) return "ndvi-3";
  if (v > 0.2) return "ndvi-2";
  return "ndvi-1";
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
  const [manualMode, setManualMode] = useState<"vertices" | "bbox">("vertices");
  const [lat, setLat] = useState("-34.5");
  const [lng, setLng] = useState("-62.0");
  const [ha, setHa] = useState("5");
  const [invName, setInvName] = useState("");
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

  /** Valida el formulario y arma `location`. Si algo falla, setea error amable y devuelve null. */
  function buildLocation(): Record<string, unknown> | null {
    if (tab === "point") {
      const la = parseNum(lat);
      const ln = parseNum(lng);
      const h = parseNum(ha);
      if (la === null || ln === null || Math.abs(la) > 90 || Math.abs(ln) > 180) {
        setError(tx("errorLatLng"));
        return null;
      }
      if (h === null || h < 1 || h > 20) {
        setError(tx("errorHa"));
        return null;
      }
      return { lat: la, lng: ln, ha: h };
    }
    if (tab === "manual" && manualMode === "bbox") {
      const { latMin, latMax, lngMin, lngMax } = bbox;
      const a = parseNum(latMin);
      const b = parseNum(latMax);
      const c = parseNum(lngMin);
      const d = parseNum(lngMax);
      if (
        a === null || b === null || c === null || d === null ||
        Math.abs(a) > 90 || Math.abs(b) > 90 || Math.abs(c) > 180 || Math.abs(d) > 180 ||
        a >= b || c >= d
      ) {
        setError(tx("errorBbox"));
        return null;
      }
      return { bbox: { lat_min: a, lat_max: b, lng_min: c, lng_max: d } };
    }
    if (tab === "manual") {
      const vertices: { lat: number; lng: number }[] = [];
      for (const line of verticesText.split("\n")) {
        const clean = line.trim();
        if (!clean) continue;
        const [a, b] = clean.split(",").map((x) => parseNum(x));
        if (a === null || b === null || Math.abs(a) > 90 || Math.abs(b) > 180) {
          setError(tx("errorVertices"));
          return null;
        }
        vertices.push({ lat: a, lng: b });
      }
      if (vertices.length < 3) {
        setError(tx("errorVertices"));
        return null;
      }
      return { vertices };
    }
    return null;
  }

  async function fetchNdvi(locationOverride?: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const location = locationOverride ?? buildLocation();
      if (!location) {
        setLoading(false);
        return;
      }
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
      const ndvi = j as NdviResult;
      setResult(ndvi);
      setLastLocation(location);
      setInvName(`${tx("queryLabel")} (${ndvi.area_ha.toFixed(1)} ha)`);
    } catch {
      setError(tx("errorFetch"));
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
          query: invName.trim() || `${tx("queryLabel")} (${result.area_ha.toFixed(1)} ha)`,
          edition_id: "2026_05",
          location: lastLocation,
          metadata: { source: "satellite", aggregation: result.aggregation },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      window.dispatchEvent(new Event("agroposta:investigation-saved"));
    } catch {
      setError(tx("errorSave"));
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
        <div className="flex gap-2 flex-wrap" role="group" aria-label={tx("tabListLabel")}>
          {(["point", "manual", "draw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTab(m)}
              aria-pressed={tab === m}
              className={`ap-btn ap-btn--md ${tab === m ? "ap-btn--secondary" : "ap-btn--ghost"}`}
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
                aria-busy={loading}
                className="ap-btn ap-btn--primary ap-btn--lg"
              >
                {loading ? t("fetching") : t("drawUse")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {tab === "point" ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="ap-field">
              <label className="ap-field__label" htmlFor="campo-lat">
                {t("lat")}
              </label>
              <input
                id="campo-lat"
                className="ap-input ap-input--technical"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                type="number"
                step="any"
                min={-90}
                max={90}
              />
            </div>
            <div className="ap-field">
              <label className="ap-field__label" htmlFor="campo-lng">
                {t("lng")}
              </label>
              <input
                id="campo-lng"
                className="ap-input ap-input--technical"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                type="number"
                step="any"
                min={-180}
                max={180}
              />
            </div>
            <div className="ap-field">
              <label className="ap-field__label" htmlFor="campo-ha">
                {t("ha")}
              </label>
              <input
                id="campo-ha"
                className="ap-input ap-input--technical"
                value={ha}
                onChange={(e) => setHa(e.target.value)}
                inputMode="decimal"
                type="number"
                step="any"
                min={1}
                max={20}
                aria-describedby="campo-ha-hint"
              />
              <span id="campo-ha-hint" className="ap-field__hint">
                {tx("haHint")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-4 flex-wrap" role="radiogroup" aria-label={tx("modeLabel")}>
              {(["vertices", "bbox"] as const).map((m) => (
                <label key={m} className="ap-radio-row">
                  <input
                    type="radio"
                    name="campo-manual-mode"
                    className="ap-radio"
                    checked={manualMode === m}
                    onChange={() => setManualMode(m)}
                  />
                  {tx(m === "vertices" ? "modeVertices" : "modeBbox")}
                </label>
              ))}
            </div>
            {manualMode === "vertices" ? (
              <div className="ap-field">
                <label className="ap-field__label" htmlFor="campo-vertices">
                  {t("verticesLabel")}
                </label>
                <textarea
                  id="campo-vertices"
                  className="ap-input ap-input--technical font-mono"
                  rows={4}
                  value={verticesText}
                  onChange={(e) => setVerticesText(e.target.value)}
                />
              </div>
            ) : (
              <div className="ap-field">
                <span className="ap-field__label" id="campo-bbox-label">
                  {t("bboxTitle")}
                </span>
                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                  role="group"
                  aria-labelledby="campo-bbox-label"
                >
                  {(["latMin", "latMax", "lngMin", "lngMax"] as const).map((k) => (
                    <input
                      key={k}
                      className="ap-input ap-input--technical"
                      placeholder={tx(k === "latMin" ? "bboxLatMin" : k === "latMax" ? "bboxLatMax" : k === "lngMin" ? "bboxLngMin" : "bboxLngMax")}
                      aria-label={tx(k === "latMin" ? "bboxLatMin" : k === "latMax" ? "bboxLatMax" : k === "lngMin" ? "bboxLngMin" : "bboxLngMax")}
                      value={bbox[k]}
                      onChange={(e) => setBbox({ ...bbox, [k]: e.target.value })}
                      inputMode="decimal"
                      type="number"
                      step="any"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="ap-field">
            <label className="ap-field__label" htmlFor="campo-agg">
              {t("aggregation")}
            </label>
            <select
              id="campo-agg"
              className="ap-input ap-select"
              value={agg}
              onChange={(e) => setAgg(e.target.value)}
            >
              <option value="P5D">P5D</option>
              <option value="P1D">P1D</option>
            </select>
          </div>
          <div className="ap-field">
            <label className="ap-field__label" htmlFor="campo-from">
              {t("from")}
            </label>
            <input
              id="campo-from"
              className="ap-input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="ap-field">
            <label className="ap-field__label" htmlFor="campo-to">
              {t("to")}
            </label>
            <input
              id="campo-to"
              className="ap-input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {tab !== "draw" && (
          <div>
            <button
              onClick={() => fetchNdvi()}
              disabled={loading}
              aria-busy={loading}
              className="ap-btn ap-btn--primary ap-btn--lg"
            >
              {loading ? t("fetching") : t("fetch")}
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-error">
            <span>⚠ {error}</span>
            <button
              onClick={() =>
                fetchNdvi(tab === "draw" && drawnPolygon ? { polygon: drawnPolygon } : undefined)
              }
              disabled={loading || (tab === "draw" && !drawnPolygon)}
              className="ap-btn ap-btn--ghost ap-btn--md"
            >
              {tx("retry")}
            </button>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="ap-card">
            <div className="ap-card__body flex flex-col gap-2">
              <p className="text-sm font-semibold text-fg">{tx("emptyTitle")}</p>
              <ol className="text-sm text-fg-secondary list-decimal ml-5 flex flex-col gap-1">
                <li>{tx("emptyStep1")}</li>
                <li>{tx("emptyStep2")}</li>
                <li>{tx("emptyStep3")}</li>
              </ol>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3" aria-live="polite">
            <div className="text-sm text-fg-secondary">
              {result.area_ha.toFixed(1)} ha · {result.centroid.lat.toFixed(4)}, {result.centroid.lng.toFixed(4)} ·{" "}
              {result.aggregation} · {result.cached ? t("cached") : t("live")}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary" role="note" aria-label={tx("legendTitle")}>
              <span>
                <span className="ndvi-dot ndvi-4" aria-hidden="true" />
                {tx("legendHigh")}
              </span>
              <span>
                <span className="ndvi-dot ndvi-3" aria-hidden="true" />
                {tx("legendMid")}
              </span>
              <span>
                <span className="ndvi-dot ndvi-2" aria-hidden="true" />
                {tx("legendLow")}
              </span>
              <span>
                <span className="ndvi-dot ndvi-1" aria-hidden="true" />
                {tx("legendStress")}
              </span>
            </div>
            <div className="ap-table-wrap">
              <table className="ap-table">
                <caption className="sr-only">{tx("tableCaption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("tableDate")}</th>
                    <th scope="col">{t("tableMean")}</th>
                    <th scope="col">{t("tableRange")}</th>
                    <th scope="col">{t("tableSamples")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.series.map((b) => (
                    <tr key={b.date_from}>
                      <td>
                        {shortDate(b.date_from)} → {shortDate(b.date_to)}
                      </td>
                      <td className="is-technical">
                        {b.ndvi_mean === null ? (
                          <span>☁ {t("cloudy")}</span>
                        ) : (
                          <>
                            <span className={`ndvi-dot ${ndviClass(b.ndvi_mean)}`} aria-hidden="true" />
                            {b.ndvi_mean.toFixed(3)}
                          </>
                        )}
                      </td>
                      <td className="is-technical">
                        {b.ndvi_min === null ? "—" : `${b.ndvi_min.toFixed(2)}–${(b.ndvi_max ?? 0).toFixed(2)}`}
                      </td>
                      <td className="is-technical is-numeric">{b.sample_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ap-field max-w-[320px]">
              <label className="ap-field__label" htmlFor="campo-inv-name">
                {tx("saveName")}
              </label>
              <input
                id="campo-inv-name"
                className="ap-input"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <button onClick={saveInvestigation} className="ap-btn ap-btn--md">
                {t("save")}
              </button>
              {saved && <span className="ml-2 text-sm text-success">✓ {t("saved")}</span>}
            </div>
            <div className="text-xs text-fg-tertiary">ⓘ {t("disclaimer")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
