"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const LabMap = dynamic(() => import("../../../components/LabMap"), {
  ssr: false,
  loading: () => <div className="text-sm opacity-60">Cargando MapLibre…</div>,
});

/** Lab /dev/map — playground MapLibre (nunca producto). */
export default function DevMapPage() {
  return (
    <div className="layout-grid builder">
      <header className="grid-header">
        <div>
          <h1>Lab · Mapa MapLibre</h1>
          <div className="subtitle">
            Esri satelital + labels + GeoJSON (Liberty vector opt-in) —{" "}
            <Link href="/dev" className="text-brand underline underline-offset-2 hover:text-brand-hover">
              volver al comparador
            </Link>
          </div>
        </div>
      </header>
      <div className="max-w-[900px] mx-auto w-full px-4 pb-24">
        <LabMap center={[-34.5, -62.0]} />
      </div>
    </div>
  );
}
