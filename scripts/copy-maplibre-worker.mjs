// Copia el Web Worker de MapLibre + su módulo compartido a public/.
// MapLibre v6 es ESM-only y resuelve el worker vía import.meta.url en runtime;
// Turbopack/webpack dejan la referencia colgada (worker importa
// "./maplibre-gl-shared.mjs" sin rewrite) y el worker nunca arranca:
// raster renderiza, vector/GeoJSON quedan colgados en silencio.
// Sirviéndolos desde public/ (mismo path, sin hash, sin transform) + setWorkerUrl
// el comportamiento es idéntico en dev y prod. Ver:
// https://github.com/vercel/next.js/issues/98137
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const publicDir = join(process.cwd(), "public");
mkdirSync(publicDir, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, f), join(publicDir, f));
  console.log(`maplibre worker: ${f} -> public/`);
}
