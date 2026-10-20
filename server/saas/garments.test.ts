import { beforeAll, afterAll, it, expect } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { openStore, type Store } from "./store";
import { createApi } from "./api";
import { validateAssembly, type Garment } from "../../shared/garment";
import { DEFAULT_DESIGN } from "../../shared/production";
let db: Store,
  server: Server,
  origin: string,
  owner: string,
  other: string,
  customer: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = ""
) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
beforeAll(async () => {
  db = openStore(":memory:");
  const app = express();
  app.use("/api", createApi(db));
  server = createServer(app);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const register = async (slug: string, isCustomer = false) =>
    request("/register", "POST", {
      slug,
      name: "Club Maker",
      email: isCustomer ? "client@example.com" : "maker@example.com",
      password: "a-long-password-123",
      ...(isCustomer ? {} : { workspace: "Club Maker" }),
    });
  owner = (await register("dxf-maker")).cookie;
  other = (await register("other-maker")).cookie;
  customer = (await register("dxf-maker", true)).cookie;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(r => server.close(() => r()));
  db.close();
});
const source = readFileSync(
  "client/public/samples/dreamteam-training.dxf",
  "utf8"
);
const recipe = JSON.parse(
  readFileSync("client/public/samples/dreamteam-training.json", "utf8")
);
let garment: Garment;
it("imports original DXF geometry, physical units and file fingerprint", async () => {
  const r = await request(
    "/garments/import",
    "POST",
    { name: "Football kit", text: source, units: "auto" },
    owner
  );
  expect(r.status).toBe(201);
  garment = r.data;
  expect(garment.panels).toHaveLength(4);
  expect(garment.panels[0].heightMm).toBe(665);
  expect(garment.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(garment.published).toBe(false);
  expect(garment.seams).toEqual([]);
});
it("keeps DXF geometry and model drafts private to the manufacturer tenant", async () => {
  expect(
    (await request("/garments/" + garment.id, "GET", undefined, other)).status
  ).toBe(404);
  expect(
    (await request("/garments/" + garment.id, "GET", undefined, customer))
      .status
  ).toBe(403);
  expect(
    (
      await request(
        "/garments/import",
        "POST",
        { name: "Attack", text: source, units: "auto" },
        customer
      )
    ).status
  ).toBe(403);
  expect((await request("/garments", "GET", undefined, customer)).data).toEqual(
    []
  );
  expect(
    (
      await request(
        "/garments/" + garment.id + "/asset",
        "GET",
        undefined,
        customer
      )
    ).status
  ).toBe(404);
});
it("saves explicit seam relationships but cannot overwrite the imported coordinates", async () => {
  const p = {
    ...garment,
    ...recipe,
    revision: garment.revision,
    panels: garment.panels.map((x: any) => ({
      ...x,
      role: recipe.panels.find((r: any) => r.layer === x.layer).role,
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    })),
  };
  const r = await request("/garments/" + garment.id, "PUT", p, owner);
  expect(r.status).toBe(200);
  expect(r.data.panels[0].points).toEqual(garment.panels[0].points);
  expect(validateAssembly(r.data)).toEqual([]);
  expect(
    (await request("/garments/" + garment.id, "PUT", p, owner)).status
  ).toBe(409);
  garment = r.data;
});
it("does not publish an uncomputed model or allow designs to reference draft models", async () => {
  expect(
    (
      await request(
        "/garments/" + garment.id + "/publish",
        "POST",
        { reviewed: true },
        owner
      )
    ).status
  ).toBe(422);
  expect(
    (
      await request(
        "/designs",
        "POST",
        { ...DEFAULT_DESIGN, garmentId: garment.id },
        owner
      )
    ).status
  ).toBe(400);
});
it("checks seam topology, direction ranges and sewing-versus-cutting distinction", () => {
  expect(validateAssembly(garment)).toEqual([]);
  expect(
    validateAssembly({ ...garment, contourType: "cut" }).join(" ")
  ).toContain("linee di cucitura");
  expect(
    validateAssembly({ ...garment, seams: garment.seams.slice(0, 4) }).join(" ")
  ).toContain("Connessione mancante");
  const wrong = structuredClone(garment);
  wrong.seams[0].a.start = 1999;
  expect(validateAssembly(wrong).join(" ")).toContain("vertice non valido");
  const duplicate = structuredClone(garment);
  duplicate.seams.push({ ...duplicate.seams[0], id: "duplicate" });
  expect(validateAssembly(duplicate).join(" ")).toContain("più cuciture");
});
