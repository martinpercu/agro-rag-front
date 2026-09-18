import { test, expect } from "@playwright/test";

// Mapas: Leaflet (/campo) + MapLibre lab (/dev/map).
// Tiles externos => screenshots con tolerancia alta; lo funcional se aserta,
// los PNG quedan como artefactos para revisión visual.

test.beforeEach(async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("pageerror", (err) => hydrationErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydration|did not match/i.test(msg.text())) {
      hydrationErrors.push(msg.text());
    }
  });
  (page as unknown as { __hydrationErrors: string[] }).__hydrationErrors = hydrationErrors;
});

test.afterEach(async ({ page }) => {
  const errs = (page as unknown as { __hydrationErrors?: string[] }).__hydrationErrors ?? [];
  expect(errs, "errores de hidratación").toEqual([]);
});

test("campo: dibujar polígono en Leaflet", async ({ page }) => {
  await page.goto("/campo");
  await page.getByRole("button", { name: /Dibujar|Draw/ }).click();

  const mapBox = page.getByTestId("field-draw-map");
  const leaflet = mapBox.locator(".leaflet-container");
  await expect(leaflet).toBeVisible();

  // 3 vértices en el mapa
  const box = await leaflet.boundingBox();
  if (!box) throw new Error("sin boundingBox del mapa");
  const pts = [
    { x: box.x + box.width * 0.35, y: box.y + box.height * 0.35 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.35 },
    { x: box.x + box.width * 0.5, y: box.y + box.height * 0.65 },
  ];
  for (const p of pts) await page.mouse.click(p.x, p.y);

  await expect(mapBox.getByText(/3 (puntos|points)/)).toBeVisible();

  // Cerrar habilita "Usar este polígono" (no se clickea: requiere backend :8002)
  await page.getByRole("button", { name: /Cerrar polígono|Close polygon/ }).click();
  await expect(page.getByRole("button", { name: /Usar este polígono|Use this polygon/ })).toBeEnabled();

  // Base Calles ya no usa tile.openstreetmap.org directo (baneo por bulk)
  const osmDirect = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".leaflet-tile")).filter((img) =>
      (img as HTMLImageElement).src.includes("tile.openstreetmap.org")
    ).length
  );
  expect(osmDirect).toBe(0);

  // Tiles quietos antes del screenshot (Esri es estático por z/x/y)
  await page.waitForFunction(
    () => document.querySelectorAll(".leaflet-tile:not(.leaflet-tile-loaded)").length === 0,
    { timeout: 30000 }
  );
  await expect(leaflet).toHaveScreenshot("campo-draw.png", {
    mask: [mapBox.locator(".leaflet-tile-pane")],
  });
});

test("campo: botón ubicar sin permiso muestra error amable", async ({ page }) => {
  await page.goto("/campo");
  await page.getByRole("button", { name: /Dibujar|Draw/ }).click();
  const mapBox = page.getByTestId("field-draw-map");
  await expect(mapBox.locator(".leaflet-container")).toBeVisible();

  await page.getByRole("button", { name: /Mi ubicación|My location/ }).click();
  // Sin permiso de geolocalización => error amable, botón se libera
  await expect(mapBox.getByText(/No se pudo obtener|Could not get/)).toBeVisible();
});

test("campo: ubicar con permiso centra el mapa", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -34.6, longitude: -62.1 });
  await page.goto("/campo");
  await page.getByRole("button", { name: /Dibujar|Draw/ }).click();
  const mapBox = page.getByTestId("field-draw-map");
  await expect(mapBox.locator(".leaflet-container")).toBeVisible();

  await page.getByRole("button", { name: /Mi ubicación|My location/ }).click();
  await expect(page.getByRole("button", { name: /Ubicando|Locating/ })).toBeHidden({ timeout: 10000 });
  await expect(mapBox.getByText(/No se pudo obtener|Could not get/)).toBeHidden();
});

test("dev/map: MapLibre hibrido carga y dibuja", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/dev/map");

  const lab = page.getByTestId("lab-map");
  await expect(lab.locator("canvas")).toBeVisible();

  // Esperar estilo + capas (tiles externos: timeout generoso)
  await page.waitForFunction(
    () => (window as unknown as { __labmap?: { loaded: () => boolean } }).__labmap?.loaded() === true,
    { timeout: 45000 }
  );

  // Capa satelital insertada bajo labels
  const hasSat = await page.evaluate(() => {
    const m = (window as unknown as { __labmap?: { getLayer: (id: string) => unknown } }).__labmap;
    return !!m?.getLayer("satellite");
  });
  expect(hasSat).toBe(true);

  // 3 clics dibujan 3 puntos (canvas WebGL: click por coordenadas)
  const canvas = lab.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sin boundingBox del canvas");
  for (const [fx, fy] of [[0.4, 0.4], [0.6, 0.4], [0.5, 0.6]] as const) {
    await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  }
  await expect(page.getByTestId("lab-status")).toContainText("3 puntos");

  await page.getByRole("button", { name: /Cerrar polígono/ }).click();
  await expect(page.getByTestId("lab-status")).toContainText("cerrado");

  // Toggle satélite
  await page.getByRole("button", { name: /Satélite/ }).click();
  await expect(page.getByTestId("lab-status")).toContainText("sat off");

  await expect(canvas).toHaveScreenshot("devmap-draw.png", { maxDiffPixelRatio: 0.05 });
});

test("smoke: home y dev cargan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Chat|chat/ }).first()).toBeVisible();
  await page.goto("/dev");
  await expect(page.getByRole("heading", { name: /Lab/ }).first()).toBeVisible();
});
