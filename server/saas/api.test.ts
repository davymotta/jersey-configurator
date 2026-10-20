import { beforeEach, afterEach, describe, it, expect } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { createApi } from "./api";
import { openStore, type Store } from "./store";
import { DEFAULT_DESIGN, SIZES, patternSchema } from "../../shared/production";
let db: Store, server: Server, origin: string;
beforeEach(async () => {
  db = openStore(":memory:");
  const app = express();
  app.use("/api", createApi(db));
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  extra: Record<string, string> = {}
) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return {
    response,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function register(
  slug = "maker-one",
  customer = false,
  email = "person@example.com"
) {
  const r = await request("/register", "POST", {
    slug,
    name: "Person Example",
    email,
    password: "long-password-123",
    ...(customer ? {} : { workspace: "Maker One" }),
  });
  expect(r.response.status).toBe(201);
  return r.cookie;
}
async function design(cookie: string, overrides = {}) {
  const r = await request(
    "/designs",
    "POST",
    { ...DEFAULT_DESIGN, ...overrides },
    cookie
  );
  expect(r.response.status).toBe(201);
  return r.data;
}
const quantities = () =>
  Object.fromEntries(SIZES.map(s => [s, s === "M" ? 10 : 0]));
async function order(
  cookie: string,
  designId: string,
  key = randomUUID(),
  extra = {}
) {
  return request(
    "/orders",
    "POST",
    {
      designId,
      customer: "Customer One",
      email: "customer@example.com",
      address: "Via Roma 10, 20100 Milano, Italia",
      notes: "",
      quantities: quantities(),
      confirmed: true,
      ...extra,
    },
    cookie,
    { "Idempotency-Key": key }
  );
}
function pattern(extra = {}) {
  return {
    name: "Manufacturer approved block",
    category: "football",
    revision: "r1",
    fabric: "Polyester 150 gsm",
    bleedMm: 10,
    minDpi: 150,
    approved: true,
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
    ...extra,
  };
}
async function approve(cookie: string, o: any) {
  const p = await request("/patterns", "POST", pattern(), cookie);
  expect(p.response.status).toBe(201);
  return request(
    `/orders/${o.id}`,
    "PATCH",
    { status: "approved", patternId: p.data.id },
    cookie
  );
}

describe("SaaS authentication and tenant boundaries", () => {
  it("requires a session and blocks cross-origin writes", async () => {
    expect((await request("/orders")).response.status).toBe(401);
    expect(
      (
        await request("/demo", "POST", {}, "", {
          Origin: "https://evil.example",
        })
      ).response.status
    ).toBe(403);
    expect(
      (await request("/demo", "POST", {}, "", { Origin: "" })).response.status
    ).toBe(403);
  });
  it("stores password hashes and revokes sessions on logout", async () => {
    const cookie = await register();
    const row = db.prepare("SELECT password FROM accounts").get() as any;
    expect(row.password).not.toContain("long-password");
    expect(
      (await request("/session", "GET", undefined, cookie)).data.user.role
    ).toBe("owner");
    await request("/logout", "POST", {}, cookie);
    expect(
      (await request("/orders", "GET", undefined, cookie)).response.status
    ).toBe(401);
    expect(
      (
        await request("/login", "POST", {
          slug: "maker-one",
          email: "person@example.com",
          password: "wrong-password-123",
        })
      ).response.status
    ).toBe(401);
    const login = await request("/login", "POST", {
      slug: "maker-one",
      email: "person@example.com",
      password: "long-password-123",
    });
    expect(login.response.status).toBe(200);
    expect(login.cookie).toContain("jersey_session=");
  });
  it("isolates tenants even for manufacturer owners", async () => {
    const a = await register(),
      b = await register("maker-two");
    const d = await design(a),
      o = (await order(a, d.id)).data;
    expect((await request("/designs", "GET", undefined, b)).data).toEqual([]);
    expect((await request("/orders", "GET", undefined, b)).data).toEqual([]);
    expect(
      (await request(`/orders/${o.id}/preflight`, "GET", undefined, b)).response
        .status
    ).toBe(404);
    expect(
      (await request(`/designs/${d.id}`, "PUT", { ...d, name: "Stolen" }, b))
        .response.status
    ).toBe(404);
    expect(
      (await request(`/orders/${o.id}/pack`, "GET", undefined, b)).response
        .status
    ).toBe(404);
  });
  it("restricts customers to their own designs/orders and manufacturer operations", async () => {
    const owner = await register(),
      a = await register("maker-one", true, "a@example.com"),
      b = await register("maker-one", true, "b@example.com");
    const d = await design(a),
      o = (await order(a, d.id)).data;
    expect((await request("/orders", "GET", undefined, b)).data).toEqual([]);
    expect(
      (await request("/orders", "GET", undefined, owner)).data
    ).toHaveLength(1);
    expect((await order(b, d.id)).response.status).toBe(404);
    expect(
      (await request("/patterns", "POST", pattern(), a)).response.status
    ).toBe(403);
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "cancelled" }, a))
        .response.status
    ).toBe(403);
    expect(
      (
        await request(
          "/workspace",
          "PATCH",
          { name: "Attack", unitPrice: 1, minimum: 1 },
          a
        )
      ).response.status
    ).toBe(403);
    expect(
      (await request("/patterns", "GET", undefined, a)).response.status
    ).toBe(403);
    expect((await approve(owner, o)).response.status).toBe(200);
    expect(
      (await request("/orders", "GET", undefined, a)).data[0].pattern
    ).toBeNull();
    expect(
      (await request("/orders", "GET", undefined, owner)).data[0].pattern.hash
    ).toMatch(/^[a-f0-9]{64}$/);
  });
});
describe("Order integrity and prepress", () => {
  it("calculates price on the server and prevents duplicate submission", async () => {
    const cookie = await register(),
      d = await design(cookie),
      key = randomUUID();
    const first = await order(cookie, d.id, key, { total: 1 }),
      second = await order(cookie, d.id, key);
    expect(first.response.status).toBe(201);
    expect(first.data.total).toBe(35000);
    expect(second.data.id).toBe(first.data.id);
    expect(
      (await order(cookie, d.id, key, { customer: "Different customer" }))
        .response.status
    ).toBe(409);
    expect(
      (await request("/orders", "GET", undefined, cookie)).data
    ).toHaveLength(1);
  });
  it("freezes design revisions and rejects concurrent edits", async () => {
    const cookie = await register(),
      d = await design(cookie),
      o = (await order(cookie, d.id)).data;
    expect(
      (
        await request(
          `/designs/${d.id}`,
          "PUT",
          { ...d, name: "Changed" },
          cookie
        )
      ).response.status
    ).toBe(200);
    expect(
      (
        await request(
          `/designs/${d.id}`,
          "PUT",
          { ...d, name: "Stale" },
          cookie
        )
      ).response.status
    ).toBe(409);
    const stored = (await request("/orders", "GET", undefined, cookie)).data[0];
    expect(stored.design.name).toBe(DEFAULT_DESIGN.name);
    expect(stored.design.revision).toBe(1);
    expect(stored.id).toBe(o.id);
  });
  it("rejects zero, negative and below-minimum quantities", async () => {
    const cookie = await register(),
      d = await design(cookie);
    for (const q of [0, -1, 9])
      expect(
        (
          await order(cookie, d.id, randomUUID(), {
            quantities: { ...quantities(), M: q },
          })
        ).response.status
      ).toBe(q === 9 ? 400 : 400);
  });
  it("requires a matching, complete approved pattern before production", async () => {
    const c = await register(),
      d = await design(c),
      o = (await order(c, d.id)).data;
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "production" }, c))
        .response.status
    ).toBe(409);
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "approved" }, c))
        .response.status
    ).toBe(400);
    expect(
      (await request(`/orders/${o.id}/pack`, "GET", undefined, c)).response
        .status
    ).toBe(409);
    const other = await request(
      "/patterns",
      "POST",
      pattern({ category: "cricket" }),
      c
    );
    expect(
      (
        await request(
          `/orders/${o.id}`,
          "PATCH",
          { status: "approved", patternId: other.data.id },
          c
        )
      ).response.status
    ).toBe(422);
    const missing = (
      await order(c, d.id, randomUUID(), {
        quantities: { ...quantities(), M: 0, L: 10 },
      })
    ).data;
    expect((await approve(c, missing)).response.status).toBe(422);
    expect((await approve(c, o)).response.status).toBe(200);
  });
  it("exports real millimetre panels, quantities and frozen production data", async () => {
    const c = await register(),
      d = await design(c, { team: "A & B <script>" }),
      o = (await order(c, d.id)).data;
    expect((await approve(c, o)).response.status).toBe(200);
    const r = await request(`/orders/${o.id}/pack`, "GET", undefined, c);
    expect(r.response.status).toBe(200);
    const files = unzipSync(r.data);
    expect(
      Object.keys(files).filter(k => k.startsWith("panels/"))
    ).toHaveLength(4);
    const svg = strFromU8(files["panels/M/front.svg"]);
    expect(svg).toContain('width="570mm" height="740mm"');
    expect(svg).toContain("A &amp; B &lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("CUT_GUIDE_REMOVE_BEFORE_RIP");
    expect(strFromU8(files["quantities.csv"])).toBe("size,quantity\nM,10");
    expect(JSON.parse(strFromU8(files["order.json"])).pattern.hash).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "production" }, c))
        .response.status
    ).toBe(200);
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "shipped" }, c))
        .response.status
    ).toBe(200);
    expect(
      (await request(`/orders/${o.id}`, "PATCH", { status: "cancelled" }, c))
        .response.status
    ).toBe(409);
  });
  it("validates raster content and blocks low-DPI artwork in production", async () => {
    const c = await register();
    expect(
      (
        await request(
          "/artwork/upload",
          "POST",
          { data: "data:image/png;base64,dGVzdA==" },
          c
        )
      ).response.status
    ).toBe(400);
    const image =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=";
    const art = await request("/artwork/upload", "POST", { data: image }, c);
    expect(art.response.status).toBe(201);
    const d = await design(c, { artworkId: art.data.id }),
      o = (await order(c, d.id)).data;
    const result = await approve(c, o);
    expect(result.response.status).toBe(422);
    expect(result.data.error).toContain("DPI");
  });
  it("does not fake AI generation without credentials", async () => {
    const c = await register();
    expect(
      (
        await request(
          "/artwork/generate",
          "POST",
          { prompt: "A football pattern", category: "football" },
          c
        )
      ).response.status
    ).toBe(503);
  });
  it("rejects executable, open, invalid and out-of-bounds paths", () => {
    expect(patternSchema.safeParse(pattern()).success).toBe(true);
    for (const path of [
      "M0 0<script>",
      "MMMMM",
      "M0 0H550V720H0",
      "M0 0H900V720H0Z",
    ]) {
      const p = pattern() as any;
      p.sizes[0].pieces[0].cutPath = path;
      expect(patternSchema.safeParse(p).success).toBe(false);
    }
    const duplicate = pattern() as any;
    duplicate.sizes[0].pieces[1].key = "front";
    expect(patternSchema.safeParse(duplicate).success).toBe(false);
  });
});
