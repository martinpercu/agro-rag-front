"use client";

import { useEffect, useState } from "react";
import { LayersControl, MapContainer, Polygon, CircleMarker, ScaleControl, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };

function toGeoJSON(verts: LatLng[]) {
  const ring = verts.map((v) => [v.lng, v.lat]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
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

export default function FieldDrawMap({
  center,
  onPolygon,
  t,
}: {
  center: [number, number];
  onPolygon: (polygon: Record<string, unknown> | null) => void;
  t: (key: string) => string;
}) {
  const [verts, setVerts] = useState<LatLng[]>([]);
  const [closed, setClosed] = useState(false);

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

  const positions: [number, number][] = verts.map((v) => [v.lat, v.lng]);

  return (
    <div className="flex flex-col gap-2">
      <MapContainer center={center} zoom={14} style={{ height: 340, width: "100%", borderRadius: 12, zIndex: 0 }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satelital">
            <TileLayer
              attribution="Imagery &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Calles">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        </LayersControl>
        <ScaleControl position="bottomleft" imperial={false} />
        <ClickCatcher onAdd={add} />
        <Recenter center={center} />
        {verts.map((v, i) => (
          <CircleMarker key={i} center={[v.lat, v.lng]} radius={6} pathOptions={{ color: "#3A5A40", fillOpacity: 1 }} />
        ))}
        {positions.length >= 2 && (
          <Polygon positions={closed ? [...positions, positions[0]] : positions} pathOptions={{ color: "#3A5A40" }} />
        )}
      </MapContainer>
      <div className="text-sm opacity-70">
        {t("drawHint")} ({verts.length} {t("drawPoints")})
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={undo} disabled={verts.length === 0} className="ap-btn ap-btn--ghost">
          {t("drawUndo")}
        </button>
        <button onClick={clear} disabled={verts.length === 0} className="ap-btn ap-btn--ghost">
          {t("drawClear")}
        </button>
        <button onClick={close} disabled={closed || verts.length < 3} className="ap-btn ap-btn--primary">
          {t("drawClose")}
        </button>
      </div>
    </div>
  );
}
