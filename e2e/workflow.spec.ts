import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("demo design → 3D → order → approved pattern → production pack", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: "Esplora la demo" }).click();
  await expect(page.getByRole("heading", { name: "Ciao, Alex" })).toBeVisible();
  await expect(
    page.getByText("Athletic · Home 26", { exact: true })
  ).toBeVisible();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/dashboard.png",
    fullPage: true,
    animations: "disabled",
    style: "[data-sonner-toaster] { display: none; }",
  });
  await page.getByRole("link", { name: "Entra nel design studio" }).click();
  await page
    .getByLabel("Nome del design", { exact: true })
    .fill("Falcons — Away 2026");
  await page.getByRole("button", { name: "Dettagli", exact: true }).click();
  await page.getByLabel("Squadra / azienda").fill("FALCONS");
  await page.getByLabel("Numero sul retro").fill("22");
  await expect(page.locator(".three-canvas canvas")).toBeVisible();
  await page.screenshot({
    path: "artifacts/studio.png",
    fullPage: true,
    animations: "disabled",
    style: "[data-sonner-toaster] { display: none; }",
  });
  await page.getByRole("button", { name: "Retro", exact: true }).click();
  await expect(page.locator(".large-flat")).toBeVisible();
  await page.getByRole("button", { name: "Salva design", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/.+/);
  await page.getByRole("button", { name: "Richiedi ordine" }).click();
  await page.getByLabel("Nome / azienda").fill("Falcons Club");
  await page.getByLabel("Email di contatto").fill("falcons@example.com");
  await page
    .getByLabel("Indirizzo di consegna")
    .fill("Via Roma 10, 20100 Milano, Italia");
  await page.getByRole("checkbox", { name: "Ho verificato" }).check();
  await page.getByRole("button", { name: "Invia richiesta" }).click();
  await expect(page).toHaveURL("/orders");
  await expect(page.getByText("Falcons Club", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Falcons Club", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Cartamodelli", exact: true }).click();
  const pattern = {
    name: "Test fixture block — demo only",
    category: "football",
    revision: "r1",
    fabric: "Test polyester",
    bleedMm: 10,
    minDpi: 150,
    approved: false,
    sizes: [
      {
        size: "M",
        pieces: ["front", "back", "left-sleeve", "right-sleeve"].map(key => ({
          key,
          widthMm: 550,
          heightMm: 720,
          cutPath: "M0 0H550V720H0Z",
        })),
      },
    ],
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "test-pattern.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pattern)),
  });
  await expect(
    page.getByRole("button", { name: "Importa cartamodello approvato" })
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Confermo che geometrie" }).check();
  await page
    .getByRole("button", { name: "Importa cartamodello approvato" })
    .click();
  await expect(page.locator(".pattern-library h3")).toHaveText(
    "Test fixture block — demo only"
  );
  await page.getByRole("link", { name: "Ordini", exact: true }).click();
  await page.getByRole("button", { name: /Apri JC-/ }).click();
  await expect(
    page.getByRole("button", { name: "Approva ordine" })
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Cartamodello approvato", exact: true })
    .selectOption({ label: "Test fixture block — demo only · rev. r1 · M" });
  await page.getByRole("button", { name: "Approva ordine" }).click();
  await expect(
    page.getByRole("button", { name: "Avvia produzione" })
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pacchetto produzione" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/JC-.+-production.zip/);
  await page.getByRole("button", { name: "Avvia produzione" }).click();
  await expect(
    page.getByRole("button", { name: "Segna spedito" })
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/order.png",
    fullPage: true,
    animations: "disabled",
    style: "[data-sonner-toaster] { display: none; }",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Apri menu" }).click();
  await page.getByRole("link", { name: "Panoramica", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ciao, Alex" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await page.screenshot({
    path: "artifacts/mobile.png",
    fullPage: true,
    animations: "disabled",
    style: "[data-sonner-toaster] { display: none; }",
  });
  expect(errors).toEqual([]);
});

test("manufacturer registration and dedicated customer storefront", async ({
  page,
  browser,
}) => {
  const slug = "maker-" + Date.now();
  await page.goto("/");
  await page.getByLabel("Il tuo nome").fill("Anna Maker");
  await page.getByLabel("Nome del fabbricante").fill("Anna Sport");
  await page.getByLabel("Indirizzo workspace").fill(slug);
  await page.getByLabel("Email", { exact: true }).fill("anna@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-long-password-123");
  await page.getByRole("button", { name: "Crea il tuo workspace" }).click();
  await expect(page.getByRole("heading", { name: "Ciao, Anna" })).toBeVisible();
  const context = await browser.newContext();
  const customer = await context.newPage();
  await customer.goto(`http://127.0.0.1:3100/store/${slug}`);
  await expect(
    customer.getByRole("heading", { name: "Anna Sport", exact: true })
  ).toBeVisible();
  await customer.getByLabel("Il tuo nome").fill("Marco Client");
  await customer.getByLabel("Email", { exact: true }).fill("marco@example.com");
  await customer
    .getByLabel("Password", { exact: true })
    .fill("a-long-password-456");
  await customer.getByRole("button", { name: "Crea account cliente" }).click();
  await expect(
    customer.getByRole("heading", { name: "Ciao, Marco" })
  ).toBeVisible();
  await expect(
    customer.getByRole("link", { name: "Cartamodelli", exact: true })
  ).toHaveCount(0);
  await expect(
    customer.getByRole("link", { name: "I miei ordini", exact: true })
  ).toBeVisible();
  await context.close();
});

test("DreamTeam imports DXF panels with explicit sewing and preserves millimetres", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Esplora la demo" }).click();
  await page.getByRole("link", { name: "Garment lab", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dal piano. Al campo." })
  ).toBeVisible();
  await page.getByRole("button", { name: "Apri capo di prova" }).click();
  await expect(page.locator(".panel-item")).toHaveCount(4);
  await expect(page.locator(".seam-list>div")).toHaveCount(10);
  await expect(page.locator(".pattern-dimensions strong")).toContainText(
    "550 × 665 MM"
  );
  await page
    .getByRole("combobox", { name: "Contorni importati" })
    .selectOption("cut");
  await expect(
    page.getByRole("button", { name: "Simula capo", exact: true })
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Contorni importati" })
    .selectOption("sewing");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(
    page.getByText("Configurazione salvata.", { exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/garment-lab.png",
    fullPage: true,
    animations: "disabled",
    style: "[data-sonner-toaster] { display:none; }",
  });
});

test("Three.js performs actual progressive path tracing", async ({ page }) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Esplora la demo" }).click();
  await page.goto("/studio");
  await expect(page.locator(".render-loading")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator(".three-canvas canvas")).toBeVisible();
  await page.getByRole("button", { name: "Path tracing", exact: true }).click();
  await expect(page.locator(".render-info")).toContainText(
    /PATH TRACING \/ [1-9]\d* SAMPLES/,
    { timeout: 75000 }
  );
  await page.screenshot({
    path: "artifacts/path-tracing.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Live PBR", exact: true }).click();
  await expect(page.locator(".render-info")).toContainText("MATERIALI TESSILI");
  expect(errors).toEqual([]);
});
