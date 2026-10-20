import { registerGarmentRoutes } from "./garments";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { parse, serialize } from "cookie";
import { z } from "zod";
import { imageSize } from "image-size";
import { zipSync, strToU8 } from "fflate";
import type { Store } from "./store";
import {
  DEFAULT_DESIGN,
  SIZES,
  designSchema,
  orderSchema,
  patternSchema,
  transitions,
  totalQuantity,
  panelSvg,
  artworkSvg,
  type Session,
  type SavedDesign,
  type SavedPattern,
  type Order,
} from "../../shared/production";

const scrypt = promisify(scryptCallback);
const COOKIE = "jersey_session";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}
type Actor = Session & { accountId: string; workspaceId: string };
type Row = Record<string, any>;
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform(s => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
async function passwordMatches(password: string, value: string) {
  const [salt, key] = value.split(":");
  if (!salt || !key) return false;
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    (await scrypt(password, salt, 64)) as Buffer
  );
}
export function createApi(
  db: Store,
  options: { aiKey?: string; secureCookies?: boolean; origin?: string } = {}
) {
  const api = express.Router();
  api.use("/garments/import", express.json({ limit: "14mb" }));
  api.use("/artwork/upload", express.json({ limit: "30mb" }));
  api.use(express.json({ limit: "2mb" }));
  const one = (sql: string, ...p: any[]) =>
    db.prepare(sql).get(...p) as Row | undefined;
  const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
  const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
  const wrap =
    (fn: (req: Request, res: Response) => Promise<any> | any) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };
  const buckets = new Map<string, { n: number; reset: number }>();
  function limit(req: Request, kind: string, max: number, windowMs = 60000) {
    const key = kind + ":" + req.ip,
      now = Date.now();
    if (buckets.size > 10000)
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    let b = buckets.get(key);
    if (!b || b.reset < now) {
      b = { n: 0, reset: now + windowMs };
      buckets.set(key, b);
    }
    if (++b.n > max) fail(429, "Troppe richieste. Riprova più tardi.");
  }
  api.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      const expected = options.origin || `${req.protocol}://${req.get("host")}`;
      if (!origin || origin !== expected)
        return res
          .status(403)
          .json({ error: "Origine della richiesta non consentita." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "È richiesto application/json." });
    }
    next();
  });
  function actor(req: Request): Actor {
    const token = parse(req.headers.cookie || "")[COOKIE];
    const row =
      token &&
      one(
        `SELECT a.*,w.slug,w.name AS workspace_name,w.unit_price,w.minimum,w.demo FROM sessions s JOIN accounts a ON a.id=s.account_id JOIN workspaces w ON w.id=a.workspace_id WHERE s.token=? AND s.expires>?`,
        hash(token),
        Date.now()
      );
    if (!row) fail(401, "Accedi per continuare.");
    return {
      accountId: row.id,
      workspaceId: row.workspace_id,
      user: { id: row.id, name: row.name, email: row.email, role: row.role },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        slug: row.slug,
        unitPrice: row.unit_price,
        minimum: row.minimum,
        demo: !!row.demo,
      },
      aiEnabled: !!options.aiKey && !row.demo,
    };
  }
  function owner(req: Request) {
    const a = actor(req);
    if (a.user.role !== "owner") fail(403, "Azione riservata al fabbricante.");
    return a;
  }
  function session(res: Response, accountId: string) {
    const token = randomBytes(32).toString("hex");
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      accountId,
      Date.now() + 7 * 86400000
    );
    res.setHeader(
      "Set-Cookie",
      serialize(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: !!options.secureCookies,
        path: "/",
        maxAge: 7 * 86400,
      })
    );
  }
  function record(table: "designs" | "orders", id: string, a: Actor) {
    const row = one(
      `SELECT * FROM ${table} WHERE id=? AND workspace_id=?`,
      id,
      a.workspaceId
    );
    if (!row || (a.user.role !== "owner" && row.account_id !== a.accountId))
      fail(404, "Elemento non trovato.");
    return row;
  }
  function image(a: Actor, id: string | null) {
    if (!id) return undefined;
    const r = one(
      "SELECT * FROM artwork WHERE id=? AND workspace_id=?",
      id,
      a.workspaceId
    );
    if (!r) fail(400, "Immagine non disponibile.");
    return r;
  }
  api.get(
    "/session",
    wrap((req, res) => {
      try {
        const a = actor(req);
        res.json(a);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) res.json(null);
        else throw e;
      }
    })
  );
  api.get(
    "/stores/:slug",
    wrap((req, res) => {
      const w = one(
        "SELECT name,slug,unit_price,minimum FROM workspaces WHERE slug=? AND demo=0",
        req.params.slug
      );
      if (!w) fail(404, "Fabbricante non trovato.");
      res.json({
        name: w.name,
        slug: w.slug,
        unitPrice: w.unit_price,
        minimum: w.minimum,
      });
    })
  );
  api.post(
    "/register",
    wrap(async (req, res) => {
      limit(req, "auth", 15);
      const p = credentials
        .extend({
          name: z.string().trim().min(2).max(80),
          workspace: z.string().trim().min(2).max(80).optional(),
          slug: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .min(3)
            .max(48),
        })
        .parse(req.body);
      const existing = one("SELECT * FROM workspaces WHERE slug=?", p.slug);
      if (p.workspace && existing) fail(409, "Questo indirizzo è già in uso.");
      if (!p.workspace && (!existing || existing.demo))
        fail(404, "Fabbricante non trovato.");
      const workspaceId = existing?.id || randomUUID(),
        id = randomUUID(),
        password = await passwordHash(p.password);
      db.exec("BEGIN IMMEDIATE");
      try {
        if (p.workspace)
          run(
            "INSERT INTO workspaces(id,slug,name) VALUES(?,?,?)",
            workspaceId,
            p.slug,
            p.workspace
          );
        if (
          one(
            "SELECT id FROM accounts WHERE workspace_id=? AND email=?",
            workspaceId,
            p.email
          )
        )
          fail(409, "Esiste già un account con questa email.");
        run(
          "INSERT INTO accounts VALUES(?,?,?,?,?,?)",
          id,
          workspaceId,
          p.name,
          p.email,
          password,
          p.workspace ? "owner" : "customer"
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      session(res, id);
      res.status(201).json({ ok: true });
    })
  );
  api.post(
    "/login",
    wrap(async (req, res) => {
      limit(req, "auth", 15);
      const p = credentials
        .extend({ slug: z.string().max(48) })
        .parse(req.body);
      const u = one(
        "SELECT a.* FROM accounts a JOIN workspaces w ON w.id=a.workspace_id WHERE w.slug=? AND a.email=? AND w.demo=0",
        p.slug,
        p.email
      );
      const matched = await passwordMatches(
        p.password,
        u?.password || `${"0".repeat(32)}:${"0".repeat(128)}`
      );
      if (!u || !matched)
        fail(401, "Credenziali o spazio fabbricante non corretti.");
      session(res, u.id);
      res.json({ ok: true });
    })
  );
  api.post(
    "/logout",
    wrap((req, res) => {
      const token = parse(req.headers.cookie || "")[COOKIE];
      if (token) run("DELETE FROM sessions WHERE token=?", hash(token));
      res.setHeader(
        "Set-Cookie",
        serialize(COOKIE, "", {
          path: "/",
          maxAge: 0,
          httpOnly: true,
          sameSite: "lax",
          secure: !!options.secureCookies,
        })
      );
      res.json({ ok: true });
    })
  );
  api.post(
    "/demo",
    wrap((req, res) => {
      limit(req, "demo", 8, 3600000);
      const id = randomUUID(),
        wid = randomUUID();
      db.exec("BEGIN IMMEDIATE");
      try {
        run(
          "INSERT INTO workspaces(id,slug,name,demo) VALUES(?,?,?,1)",
          wid,
          `demo-${wid}`,
          "DreamTeam / Demo club"
        );
        run(
          "INSERT INTO accounts VALUES(?,?,?,?,?,?)",
          id,
          wid,
          "Alex Morgan",
          "demo@example.invalid",
          "disabled",
          "owner"
        );
        for (const [i, category] of [
          "football",
          "cricket",
          "corporate",
        ].entries()) {
          const d: SavedDesign = {
            ...DEFAULT_DESIGN,
            id: randomUUID(),
            category: "football" as const,
            name: [
              "Athletic · Home 26",
              "Athletic · Away 26",
              "Athletic · Training 26",
            ][i],
            pattern: ["diagonal", "wave", "stripes"][i] as any,
            primary: ["#12392e", "#163f69", "#302950"][i],
            secondary: ["#d5ec7b", "#e9b84c", "#c2b6e3"][i],
            updatedAt: new Date().toISOString(),
            revision: 1,
          };
          run(
            "INSERT INTO designs VALUES(?,?,?,?)",
            d.id,
            wid,
            id,
            JSON.stringify(d)
          );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      session(res, id);
      res.status(201).json({ ok: true });
    })
  );
  api.patch(
    "/workspace",
    wrap((req, res) => {
      const a = owner(req),
        p = z
          .object({
            name: z.string().trim().min(2).max(80),
            unitPrice: z.number().int().min(100).max(1000000),
            minimum: z.number().int().min(1).max(10000),
          })
          .parse(req.body);
      run(
        "UPDATE workspaces SET name=?,unit_price=?,minimum=? WHERE id=?",
        p.name,
        p.unitPrice,
        p.minimum,
        a.workspaceId
      );
      res.json({ ok: true });
    })
  );
  api.get(
    "/designs",
    wrap((req, res) => {
      const a = actor(req);
      res.json(
        all(
          "SELECT data FROM designs WHERE workspace_id=? AND account_id=? ORDER BY rowid DESC",
          a.workspaceId,
          a.accountId
        ).map(x => JSON.parse(x.data))
      );
    })
  );
  function checkGarment(a: Actor, id: string | null) {
    if (!id) return;
    const row = one(
      "SELECT data FROM garments WHERE id=? AND workspace_id=?",
      id,
      a.workspaceId
    );
    if (!row) fail(400, "Capo 3D non disponibile.");
    const g = JSON.parse(row.data);
    if (!g.published || g.status !== "ready")
      fail(
        400,
        "Il fabbricante deve prima verificare e pubblicare il capo 3D."
      );
  }
  api.post(
    "/designs",
    wrap((req, res) => {
      const a = actor(req),
        p = designSchema.parse(req.body);
      checkGarment(a, p.garmentId);
      const art = image(a, p.artworkId);
      if (art && art.account_id !== a.accountId)
        fail(403, "Immagine non disponibile.");
      const d: SavedDesign = {
        ...p,
        id: randomUUID(),
        updatedAt: new Date().toISOString(),
        revision: 1,
      };
      run(
        "INSERT INTO designs VALUES(?,?,?,?)",
        d.id,
        a.workspaceId,
        a.accountId,
        JSON.stringify(d)
      );
      res.status(201).json(d);
    })
  );
  api.put(
    "/designs/:id",
    wrap((req, res) => {
      const a = actor(req),
        old = record("designs", req.params.id, a);
      if (old.account_id !== a.accountId)
        fail(403, "Puoi modificare solo i tuoi design.");
      const p = designSchema
          .extend({ revision: z.number().int().positive() })
          .parse(req.body),
        prev: SavedDesign = JSON.parse(old.data);
      if (p.revision !== prev.revision)
        fail(409, "Il design è stato modificato: ricarica la pagina.");
      checkGarment(a, p.garmentId);
      const art = image(a, p.artworkId);
      if (art && art.account_id !== a.accountId)
        fail(403, "Immagine non disponibile.");
      const d = {
        ...designSchema.parse(p),
        id: prev.id,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      run("UPDATE designs SET data=? WHERE id=?", JSON.stringify(d), d.id);
      res.json(d);
    })
  );
  api.get(
    "/patterns",
    wrap((req, res) => {
      const a = owner(req);
      res.json(
        all(
          "SELECT data FROM patterns WHERE workspace_id=? ORDER BY rowid DESC",
          a.workspaceId
        ).map(x => JSON.parse(x.data))
      );
    })
  );
  api.post(
    "/patterns",
    wrap((req, res) => {
      const a = owner(req),
        p = patternSchema.parse(req.body),
        d: SavedPattern = {
          ...p,
          id: randomUUID(),
          hash: hash(JSON.stringify(p)),
          createdAt: new Date().toISOString(),
        };
      run(
        "INSERT INTO patterns VALUES(?,?,?)",
        d.id,
        a.workspaceId,
        JSON.stringify(d)
      );
      res.status(201).json(d);
    })
  );
  api.get(
    "/orders",
    wrap((req, res) => {
      const a = actor(req);
      res.json(
        all(
          `SELECT data FROM orders WHERE workspace_id=? ${a.user.role === "owner" ? "" : "AND account_id=?"} ORDER BY rowid DESC`,
          ...(a.user.role === "owner"
            ? [a.workspaceId]
            : [a.workspaceId, a.accountId])
        ).map(x => {
          const order: Order = JSON.parse(x.data);
          return a.user.role === "owner" ? order : { ...order, pattern: null };
        })
      );
    })
  );
  api.post(
    "/orders",
    wrap((req, res) => {
      const a = actor(req),
        p = orderSchema.parse(req.body),
        key = z.string().uuid().parse(req.headers["idempotency-key"]);
      const existing = one(
        "SELECT data FROM orders WHERE account_id=? AND request_key=?",
        a.accountId,
        key
      );
      if (existing) {
        const prev: Order = JSON.parse(existing.data);
        const before = [
          prev.design.id,
          prev.customer,
          prev.email,
          prev.address,
          prev.notes,
          SIZES.map(s => prev.quantities[s]),
        ];
        const after = [
          p.designId,
          p.customer,
          p.email,
          p.address,
          p.notes,
          SIZES.map(s => p.quantities[s]),
        ];
        if (JSON.stringify(before) !== JSON.stringify(after))
          fail(
            409,
            "La chiave della richiesta è già associata a un ordine diverso. Riapri il modulo per inviare una nuova richiesta."
          );
        return res.json(prev);
      }
      const row = record("designs", p.designId, a);
      if (row.account_id !== a.accountId) fail(403, "Seleziona un tuo design.");
      const quantity = totalQuantity(p.quantities);
      if (quantity < a.workspace.minimum)
        fail(400, `Il minimo d’ordine è ${a.workspace.minimum} capi.`);
      const id = randomUUID(),
        createdAt = new Date().toISOString(),
        d: Order = {
          id,
          reference: `JC-${id.slice(0, 8).toUpperCase()}`,
          customer: p.customer,
          email: p.email,
          address: p.address,
          notes: p.notes,
          quantities: p.quantities,
          design: JSON.parse(row.data),
          createdAt,
          status: "submitted",
          total: quantity * a.workspace.unitPrice,
          quantity,
          pattern: null,
          history: [{ status: "submitted", at: createdAt }],
        };
      run(
        "INSERT INTO orders VALUES(?,?,?,?,?)",
        id,
        a.workspaceId,
        a.accountId,
        JSON.stringify(d),
        key
      );
      res.status(201).json(d);
    })
  );
  function preflight(a: Actor, o: Order) {
    const issues: string[] = [];
    if (!o.pattern) issues.push("Associa un cartamodello approvato.");
    if (o.pattern) {
      for (const [size, q] of Object.entries(o.quantities))
        if (q > 0 && !o.pattern.sizes.some(s => s.size === size))
          issues.push(`Manca il cartamodello per ${size}.`);
      if (issues.length) return issues;
      if (o.design.artworkId) {
        const img = image(a, o.design.artworkId);
        const maxMm = Math.max(
          ...o.pattern.sizes
            .filter(s => o.quantities[s.size] > 0)
            .flatMap(s =>
              s.pieces.map(p =>
                Math.max(
                  (p.widthMm + 2 * o.pattern!.bleedMm) / 0.6,
                  p.heightMm + 2 * o.pattern!.bleedMm
                )
              )
            )
        );
        const dpi = Math.floor(img!.pixels / (maxMm / 25.4));
        if (dpi < o.pattern.minDpi)
          issues.push(
            `Immagine a ${dpi} DPI effettivi; richiesti ${o.pattern.minDpi} DPI. Carica una grafica a risoluzione maggiore o usa un design vettoriale.`
          );
      }
    }
    return issues;
  }
  api.get(
    "/orders/:id/preflight",
    wrap((req, res) => {
      const a = actor(req),
        o: Order = JSON.parse(record("orders", req.params.id, a).data);
      res.json({ issues: preflight(a, o) });
    })
  );
  api.patch(
    "/orders/:id",
    wrap((req, res) => {
      const a = owner(req),
        p = z
          .object({
            status: z.enum([
              "submitted",
              "approved",
              "production",
              "shipped",
              "cancelled",
            ]),
            patternId: z.string().uuid().optional(),
          })
          .parse(req.body),
        o: Order = JSON.parse(record("orders", req.params.id, a).data);
      if (!transitions[o.status].includes(p.status))
        fail(409, "Transizione di stato non consentita.");
      if (p.status === "approved") {
        if (!p.patternId) fail(400, "Seleziona un cartamodello.");
        const row = one(
          "SELECT data FROM patterns WHERE id=? AND workspace_id=?",
          p.patternId,
          a.workspaceId
        );
        if (!row) fail(404, "Cartamodello non trovato.");
        o.pattern = JSON.parse(row.data);
        if (o.pattern!.category !== o.design.category)
          fail(
            422,
            "Il cartamodello deve corrispondere alla categoria del design."
          );
      }
      if (p.status === "approved" || p.status === "production") {
        const issues = preflight(a, o);
        if (issues.length) fail(422, issues.join(" "));
      }
      o.status = p.status;
      o.history.push({ status: p.status, at: new Date().toISOString() });
      run("UPDATE orders SET data=? WHERE id=?", JSON.stringify(o), o.id);
      res.json(o);
    })
  );
  api.get(
    "/orders/:id/pack",
    wrap((req, res) => {
      const a = owner(req),
        o: Order = JSON.parse(record("orders", req.params.id, a).data);
      if (!["approved", "production", "shipped"].includes(o.status))
        fail(409, "Approva l’ordine prima di esportare.");
      const issues = preflight(a, o);
      if (issues.length) fail(422, issues.join(" "));
      const imageData = image(a, o.design.artworkId)?.data,
        files: Record<string, Uint8Array> = {};
      files["order.json"] = strToU8(JSON.stringify(o, null, 2));
      files["pattern.json"] = strToU8(JSON.stringify(o.pattern, null, 2));
      files["quantities.csv"] = strToU8(
        "size,quantity\n" +
          Object.entries(o.quantities)
            .filter(([, q]) => q > 0)
            .map(([s, q]) => `${s},${q}`)
            .join("\n")
      );
      files["preview-front.svg"] = strToU8(
        artworkSvg(o.design, false, imageData)
      );
      files["preview-back.svg"] = strToU8(
        artworkSvg(o.design, true, imageData)
      );
      for (const size of o.pattern!.sizes)
        if (o.quantities[size.size] > 0)
          for (const piece of size.pieces)
            files[`panels/${size.size}/${piece.key}.svg`] = strToU8(
              panelSvg(o.design, piece, o.pattern!, imageData)
            );
      files["READ-ME.txt"] = strToU8(
        `PRODUCTION HANDOFF ${o.reference}\nPattern SHA-256: ${o.pattern!.hash}\nSVG units: millimetres. Bleed: ${o.pattern!.bleedMm}mm.\nSeparate panels by size; quantity in quantities.csv. Artwork and pattern are frozen order snapshots.\nCUT_GUIDE_REMOVE_BEFORE_RIP is a magenta cut guide: remove this group before rasterising/printing. SVG text must be outlined in your prepress software with the intended Arial-compatible font.\nArtwork is RGB. Apply the printer/fabric ICC profile, mirror and nest in your RIP as required. Run a strike-off and verify dimensions, bleed, seams and colour before the production run. No nesting, fabric shrink compensation or ICC conversion is performed here.\n`
      );
      res
        .type("application/zip")
        .setHeader(
          "Content-Disposition",
          `attachment; filename="${o.reference}-production.zip"`
        );
      res.send(Buffer.from(zipSync(files)));
    })
  );
  api.get(
    "/artwork/:id",
    wrap((req, res) => {
      const a = actor(req),
        r = image(a, req.params.id);
      if (a.user.role !== "owner" && r!.account_id !== a.accountId)
        fail(404, "Immagine non disponibile.");
      res.json({ data: r!.data });
    })
  );
  api.post(
    "/artwork/upload",
    wrap((req, res) => {
      const a = actor(req);
      limit(req, "upload", 20, 3600000);
      const p = z
        .object({
          data: z
            .string()
            .max(28 * 1024 * 1024)
            .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
        })
        .parse(req.body);
      const buffer = Buffer.from(p.data.split(",")[1], "base64");
      if (buffer.length > 20 * 1024 * 1024) fail(413, "Il file supera 20 MB.");
      let dimensions: ReturnType<typeof imageSize>;
      try {
        dimensions = imageSize(buffer);
      } catch {
        fail(400, "Immagine non valida.");
      }
      if (
        !["png", "jpg"].includes(dimensions.type || "") ||
        !dimensions.width ||
        !dimensions.height ||
        dimensions.width > 16000 ||
        dimensions.height > 16000 ||
        dimensions.width * dimensions.height > 64000000
      )
        fail(400, "Formato o dimensioni non supportati.");
      const declared = p.data.startsWith("data:image/png") ? "png" : "jpg";
      if (dimensions.type !== declared)
        fail(400, "Il formato del file non corrisponde al contenuto.");
      const id = randomUUID();
      run(
        "INSERT INTO artwork VALUES(?,?,?,?,?)",
        id,
        a.workspaceId,
        a.accountId,
        p.data,
        Math.min(dimensions.width, dimensions.height)
      );
      res.status(201).json({ id, data: p.data });
    })
  );
  api.post(
    "/artwork/generate",
    wrap(async (req, res) => {
      const a = actor(req);
      limit(req, "ai", 5, 3600000);
      if (!a.aiEnabled)
        fail(503, "Configura OPENAI_API_KEY sul server per abilitare l’AI.");
      const p = z
        .object({
          prompt: z.string().trim().min(10).max(1500),
          category: z.enum(["football", "cricket", "corporate"]),
        })
        .parse(req.body);
      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.aiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            size: "1024x1024",
            n: 1,
            prompt: `Create flat seamless sublimation textile artwork for a ${p.category} jersey. Edge-to-edge pattern only, no garment mockup, no text, no logos, no shadows. Brief: ${p.prompt}`,
          }),
          signal: AbortSignal.timeout(180000),
        }
      );
      if (!response.ok)
        fail(502, "Il servizio AI non ha completato la generazione. Riprova.");
      const result = (await response.json()) as {
        data?: { b64_json?: string }[];
      };
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) fail(502, "Il servizio AI non ha restituito un’immagine.");
      const id = randomUUID(),
        data = `data:image/png;base64,${b64}`;
      run(
        "INSERT INTO artwork VALUES(?,?,?,?,?)",
        id,
        a.workspaceId,
        a.accountId,
        data,
        1024
      );
      res.json({ id, data });
    })
  );
  registerGarmentRoutes(api, db, { actor, owner, wrap, fail, limit });
  api.use((_req, res) => res.status(404).json({ error: "API non trovata." }));
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map(i => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (err instanceof ApiError)
      return res.status(err.status).json({ error: err.message });
    if ((err as any)?.type === "entity.parse.failed")
      return res.status(400).json({ error: "JSON non valido." });
    if ((err as any)?.type === "entity.too.large")
      return res.status(413).json({ error: "File troppo grande." });
    console.error(
      "API request failed",
      err instanceof Error ? err.message : "Unknown error"
    );
    res.status(500).json({ error: "Errore interno. Riprova." });
  });
  return api;
}
