"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  LayersControl,
  MapContainer,
  Polygon,
  CircleMarker,
  Circle,
  ScaleControl,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };

function toGeoJSON(verts: LatLng[]) {
  const ring = verts.map((v) => [v.lng, v.lat]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ClickCatcher({ onAdd }: { onAdd: (v: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 13));
  }, [map, center]);
  return null;
}

function LocationEvents({
  onFound,
  onError,
}: {
  onFound: (v: LatLng, accuracyM: number) => void;
  onError: () => void;
}) {
  useMapEvents({
    locationfound(e) {
      onFound({ lat: e.latlng.lat, lng: e.latlng.lng }, e.accuracy ?? 0);
    },
    locationerror() {
      onError();
    },
  });
  return null;
}

export default function FieldDrawMap({
  center,
  onPolygon,
  saved,
  t,
}: {
  center: [number, number];
  onPolygon: (polygon: Record<string, unknown> | null) => void;
  saved?: FeatureCollection | null;
  t: (key: string) => string;
}) {
  const [verts, setVerts] = useState<LatLng[]>([]);
  const [closed, setClosed] = useState(false);
  const [me, setMe] = useState<(LatLng & { acc: number }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  function add(v: LatLng) {
    if (closed) return;
    setVerts((prev) => [...prev, v]);
  }
  function undo() {
    setClosed(false);
    setVerts((prev) => prev.slice(0, -1));
  }
  function clear() {
    setClosed(false);
    setVerts([]);
    onPolygon(null);
  }
  function close() {
    if (verts.length < 3) return;
    setClosed(true);
    onPolygon(toGeoJSON(verts));
  }
  function locate() {
    setLocError(false);
    setLocating(true);
    mapRef.current?.locate({ setView: true, maxZoom: 14 });
  }

  const positions: [number, number][] = verts.map((v) => [v.lat, v.lng]);
  const savedCount = saved?.features?.length ?? 0;

  return (
    <div className="flex flex-col gap-2" data-testid="field-draw-map">
      <MapContainer
        center={center}
        zoom={14}
        ref={mapRef}
        style={{ height: 340, width: "100%", borderRadius: 12, zIndex: 0 }}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satelital">
            <TileLayer
              attribution="Imagery &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Calles">
            <TileLayer
              attribution="Esri, HERE, Garmin, OpenStreetMap contributors"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name="Lugares y rutas">
            <TileLayer
              attribution="Esri, HERE, Garmin, OpenStreetMap contributors"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.Overlay>
          <LayersControl.Overlay checked name="Transporte">
            <TileLayer
              attribution="Esri, HERE, Garmin, OpenStreetMap contributors"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.Overlay>
          {savedCount > 0 && saved && (
            <LayersControl.Overlay checked name={`${t("savedLayer")} (${savedCount})`}>
              <GeoJSON
                data={saved}
                style={() => ({ color: "#c05621", weight: 2, dashArray: "5 4", fillOpacity: 0.08 })}
                pointToLayer={(_f, ll) =>
                  L.circleMarker(ll, { radius: 7, color: "#c05621", weight: 2, fillOpacity: 0.9 })
                }
                onEachFeature={(f, layer) => {
                  const p = (f.properties || {}) as { title?: unknown; meta?: unknown };
                  const title = typeof p.title === "string" ? p.title : "";
                  const meta = typeof p.meta === "string" ? p.meta : "";
                  if (title) layer.bindPopup(`<b>${escapeHtml(title)}</b>${meta ? `<br/>${escapeHtml(meta)}` : ""}`);
                }}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        <ScaleControl position="bottomleft" imperial={false} />
        <ClickCatcher onAdd={add} />
        <Recenter center={center} />
        <LocationEvents
          onFound={(v, acc) => {
            setLocating(false);
            setMe({ ...v, acc });
          }}
          onError={() => {
            setLocating(false);
            setLocError(true);
          }}
        />
        {verts.map((v, i) => (
          <CircleMarker key={i} center={[v.lat, v.lng]} radius={6} pathOptions={{ color: "#3A5A40", fillOpacity: 1 }} />
        ))}
        {positions.length >= 2 && (
          <Polygon positions={closed ? [...positions, positions[0]] : positions} pathOptions={{ color: "#3A5A40" }} />
        )}
        {me && (
          <>
            {me.acc > 0 && (
              <Circle center={[me.lat, me.lng]} radius={me.acc} pathOptions={{ color: "#1d4ed8", weight: 1, fillOpacity: 0.12 }} />
            )}
            <CircleMarker center={[me.lat, me.lng]} radius={7} pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 1 }} />
          </>
        )}
      </MapContainer>
      <div className="text-sm opacity-70">
        {t("drawHint")} ({verts.length} {t("drawPoints")})
        {locError && <span className="ml-2 text-red-600 dark:text-red-400">⚠ {t("locateError")}</span>}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={undo} disabled={verts.length === 0} className="ap-btn ap-btn--ghost ap-btn--sm">
          {t("drawUndo")}
        </button>
        <button onClick={clear} disabled={verts.length === 0} className="ap-btn ap-btn--ghost ap-btn--sm">
          {t("drawClear")}
        </button>
        <button onClick={close} disabled={closed || verts.length < 3} className="ap-btn ap-btn--primary ap-btn--sm">
          {t("drawClose")}
        </button>
        <button onClick={locate} disabled={locating} className="ap-btn ap-btn--ghost ap-btn--sm" title={t("locate")}>
          {locating ? t("locating") : t("locate")}
        </button>
      </div>
    </div>
  );
}
