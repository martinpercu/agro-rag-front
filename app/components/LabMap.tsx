"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type LngLat = { lng: number; lat: number };
export type LabBase = "esri" | "liberty";

const LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_PLACES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_TRANSPORT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";

/** Estilo 100% inline: sin glyphs/sprite (no hay symbol layers) — solo raster + GeoJSON. */
function esriStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [ESRI_IMAGERY],
        tileSize: 256,
        attribution: "Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics",
      },
      places: {
        type: "raster",
        tiles: [ESRI_PLACES],
        tileSize: 256,
        attribution: "Esri, HERE, Garmin, OpenStreetMap contributors",
      },
      transport: {
        type: "raster",
        tiles: [ESRI_TRANSPORT],
        tileSize: 256,
        attribution: "Esri, HERE, Garmin, OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "satellite", type: "raster", source: "satellite" },
      { id: "transport", type: "raster", source: "transport" },
      { id: "places", type: "raster", source: "places" },
    ],
  };
}

function webglOK(): boolean {  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function collectionOf(verts: LngLat[], closed: boolean): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = verts.map((p) => ({
    type: "Feature",
    properties: { kind: "point" },
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  }));
  if (verts.length >= (closed ? 3 : 2)) {
    const ring = verts.map((v) => [v.lng, v.lat]);
    ring.push(ring[0]);
    feats.push({
      type: "Feature",
      properties: { kind: "poly" },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
  }
  return { type: "FeatureCollection", features: feats };
}

function ensureLayer(map: maplibregl.Map, layer: maplibregl.LayerSpecification, before?: string) {
  if (map.getLayer(layer.id)) map.removeLayer(layer.id);
  map.addLayer(layer, before);
}

/**
 * LabMap — zona de investigación MapLibre (lab, no producto).
 * Base Esri inline por defecto (determinística, sin glyphs/sprite).
 * Base Liberty opt-in: vector + raster satelital insertado bajo labels
 * (patrón "raster imagery + vector labels" del skill maplibre-tile-sources).
 */
export default function LabMap({ center }: { center: [number, number] }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [verts, setVerts] = useState<LngLat[]>([]);
  const [closed, setClosed] = useState(false);
  const [satOn, setSatOn] = useState(true);
  const [base, setBase] = useState<LabBase>("esri");
  const [status, setStatus] = useState("cargando estilo…");
  const [error, setError] = useState("");
  // Espejos para handlers de mapa (evitan setState anidados bajo StrictMode)
  const vertsRef = useRef<LngLat[]>([]);
  const closedRef = useRef(false);
  const baseRef = useRef<LabBase>("esri");
  const satOnRef = useRef(true);

  function setVertsAndStatus(next: LngLat[], suffix = "") {
    vertsRef.current = next;
    setVerts(next);
    setStatus(`${next.length} puntos${suffix}`);
  }

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    if (!webglOK()) {
      setError("WebGL no disponible en este navegador — MapLibre no puede renderizar.");
      return;
    }
    // Worker servido desde public/ (ver scripts/copy-maplibre-worker.mjs):
    // sin esto Turbopack/webpack dejan colgada la URL del worker v6 y
    // vector/GeoJSON quedan cargando en silencio (raster anda igual).
    try {
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
    } catch {}
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: divRef.current,
        style: esriStyle(),
        center: [center[1], center[0]],
        zoom: 13,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    mapRef.current = map;
    // Expuesto para Playwright (solo lab): espera a map.loaded()
    (window as unknown as { __labmap?: maplibregl.Map }).__labmap = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
      "top-right"
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    // style.load dispara con el estilo inicial y con cada setStyle:
    // (re)crea las capas runtime de forma idempotente.
    map.on("style.load", () => {
      if (baseRef.current === "liberty") {
        if (!map.getSource("satellite")) {
          map.addSource("satellite", {
            type: "raster",
            tiles: [ESRI_IMAGERY],
            tileSize: 256,
            attribution: "Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics",
          });
        }
        // Injection pattern del skill: bajo el primer symbol para no tapar labels
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        const satLayer: maplibregl.LayerSpecification = { id: "satellite", type: "raster", source: "satellite" };
        ensureLayer(map, satLayer, firstSymbol);
        map.setLayoutProperty("satellite", "visibility", satOnRef.current ? "visible" : "none");
      }
      if (!map.getSource("draw")) {
        map.addSource("draw", { type: "geojson", data: collectionOf([], false) });
      }
      const polyFilter = ["==", ["get", "kind"], "poly"] as unknown as maplibregl.FilterSpecification;
      const pointFilter = ["==", ["get", "kind"], "point"] as unknown as maplibregl.FilterSpecification;
      ensureLayer(map, {
        id: "draw-fill",
        type: "fill",
        source: "draw",
        filter: polyFilter,
        paint: { "fill-color": "#c05621", "fill-opacity": 0.18 },
      });
      ensureLayer(map, {
        id: "draw-line",
        type: "line",
        source: "draw",
        filter: polyFilter,
        paint: { "line-color": "#c05621", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      ensureLayer(map, {
        id: "draw-points",
        type: "circle",
        source: "draw",
        filter: pointFilter,
        paint: {
          "circle-color": "#c05621",
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      const src = map.getSource("draw") as maplibregl.GeoJSONSource | undefined;
      try {
        src?.setData(collectionOf(vertsRef.current, closedRef.current));
      } catch {}
      setStatus(`listo · ${vertsRef.current.length} puntos`);
    });

    map.on("click", (e) => {
      if (closedRef.current) return;
      setVertsAndStatus([...vertsRef.current, { lng: e.lngLat.lng, lat: e.lngLat.lat }]);
    });
    map.on("error", (e) => {
      const msg = (e as { error?: { message?: string } })?.error?.message;
      if (msg && !/aborted|cancel/i.test(msg)) setStatus((s) => `${s.split(" · ")[0]} · aviso tiles`);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      delete (window as unknown as { __labmap?: maplibregl.Map }).__labmap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza el source GeoJSON con el estado (patrón geojson-overlay del skill)
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("draw") as maplibregl.GeoJSONSource | undefined;
    if (map && src) {
      try {
        src.setData(collectionOf(verts, closed));
      } catch {}
    }
  }, [verts, closed]);

  function undo() {
    closedRef.current = false;
    setClosed(false);
    setVertsAndStatus(vertsRef.current.slice(0, -1));
  }
  function clear() {
    closedRef.current = false;
    setClosed(false);
    setVertsAndStatus([]);
  }
  function close() {
    if (vertsRef.current.length < 3) return;
    closedRef.current = true;
    setClosed(true);
    setStatus(`${vertsRef.current.length} puntos · cerrado`);
  }
  function toggleSat() {
    const next = !satOnRef.current;
    satOnRef.current = next;
    setSatOn(next);
    const map = mapRef.current;
    if (map?.getLayer("satellite")) {
      map.setLayoutProperty("satellite", "visibility", next ? "visible" : "none");
    }
  }
  function switchBase(next: LabBase) {
    const map = mapRef.current;
    if (!map || next === baseRef.current) return;
    baseRef.current = next;
    setBase(next);
    setStatus("cargando estilo…");
    map.setStyle(next === "liberty" ? LIBERTY_STYLE : esriStyle());
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative" data-testid="lab-map">
        <div ref={divRef} style={{ height: "62vh", width: "100%", borderRadius: 12 }} />
        <div
          data-testid="lab-status"
          className="absolute left-2 bottom-6 rounded bg-black/55 px-2 py-1 font-mono text-[11px] text-white pointer-events-none"
        >
          {error ? `error: ${error}` : `maplibre · ${base} · sat ${satOn ? "on" : "off"} · ${status}`}
        </div>
      </div>
      {error && <div className="text-sm text-red-600 dark:text-red-400">⚠ {error}</div>}
      <div className="flex gap-2 flex-wrap">
        <button onClick={undo} disabled={verts.length === 0} className="ap-btn ap-btn--ghost">
          Deshacer
        </button>
        <button onClick={clear} disabled={verts.length === 0} className="ap-btn ap-btn--ghost">
          Limpiar
        </button>
        <button onClick={close} disabled={closed || verts.length < 3} className="ap-btn ap-btn--primary">
          Cerrar polígono
        </button>
        <button onClick={toggleSat} className="ap-btn ap-btn--ghost">
          Satélite {satOn ? "on" : "off"}
        </button>
        <button
          onClick={() => switchBase(base === "esri" ? "liberty" : "esri")}
          className="ap-btn ap-btn--ghost"
          title="Liberty = vector OpenFreeMap (requiere red, flaky) — solo juego manual"
        >
          Base: {base === "esri" ? "Esri" : "Liberty"}
        </button>
      </div>
      <div className="text-xs opacity-60">
        ⓘ Lab: base Esri inline (sin glyphs/sprite) · Liberty vector opt-in con Esri raster bajo labels · clic
        agrega vértices · nota cartográfica: sobre imagery los labels claros pierden contraste
        (skill maplibre-cartography).
      </div>
    </div>
  );
}
