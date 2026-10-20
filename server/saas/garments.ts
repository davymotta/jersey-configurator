import type { Router, Request, Response } from "express";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Store } from "./store";
import type { Session } from "../../shared/production";
import {
  assemblySchema,
  validateAssembly,
  type Garment,
  type GarmentSummary,
  type SimulationReport,
} from "../../shared/garment";
const execute = promisify(execFile);
type Actor = Session & { accountId: string; workspaceId: string };
type Helpers = {
  actor: (r: Request) => Actor;
  owner: (r: Request) => Actor;
  wrap: (fn: (req: Request, res: Response) => any) => any;
  fail: (status: number, message: string) => never;
  limit: (r: Request, kind: string, max: number, window?: number) => void;
};
let cachedCapabilities: { dxf: boolean; simulation: boolean } | undefined;
const root = path.resolve(process.env.GARMENT_DATA_PATH || "data/garments");
const python = process.env.PYTHON_BIN || "python3",
  blender = process.env.BLENDER_BIN || "blender";
const pipeline = path.resolve("pipeline");
const children = new Set<ReturnType<typeof spawn>>();
process.once("exit", () => {
  for (const child of children) child.kill("SIGTERM");
});
export function registerGarmentRoutes(api: Router, db: Store, h: Helpers) {
  const get = (id: string, a: Actor): Garment => {
    const row = db
      .prepare("SELECT data FROM garments WHERE id=? AND workspace_id=?")
      .get(id, a.workspaceId) as { data: string } | undefined;
    if (!row) h.fail(404, "Capo non trovato.");
    return JSON.parse(row!.data);
  };
  const save = (g: Garment) =>
    db
      .prepare("UPDATE garments SET data=? WHERE id=?")
      .run(JSON.stringify(g), g.id);
  // A single local worker. Interrupted jobs become explicit failures after restart.
  for (const row of db.prepare("SELECT id,data FROM garments").all() as {
    id: string;
    data: string;
  }[]) {
    const g: Garment = JSON.parse(row.data);
    if (g.status === "queued" || g.status === "simulating") {
      g.status = "failed";
      g.error =
        "Worker riavviato. Riapri il capo e avvia una nuova simulazione.";
      save(g);
    }
  }
  const queue: { g: Garment; workspaceId: string }[] = [];
  let running = false;
  const capabilities = (cachedCapabilities ??= {
    dxf:
      spawnSync(python, ["-c", "import ezdxf"], {
        timeout: 5000,
        stdio: "ignore",
      }).status === 0,
    simulation:
      spawnSync(blender, ["--version"], { timeout: 5000, stdio: "ignore" })
        .status === 0,
  });
  function summary(g: Garment): GarmentSummary {
    return {
      id: g.id,
      name: g.name,
      status: g.status,
      published: g.published,
      createdAt: g.createdAt,
      report: g.report,
      revision: g.revision,
    };
  }
  function pump() {
    if (running || !queue.length) return;
    running = true;
    const job = queue.shift()!,
      g = job.g;
    g.status = "simulating";
    g.phase = "Meshing";
    save(g);
    const dir = path.join(root, g.id, g.jobId!);
    const child = spawn(
      blender,
      [
        "-b",
        "--factory-startup",
        "--disable-autoexec",
        "--python-exit-code",
        "1",
        "-t",
        "2",
        "--python",
        path.join(pipeline, "simulate.py"),
        "--",
        path.join(dir, "input.json"),
        path.join(dir, "garment.glb"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    children.add(child);
    let buffer = "",
      errors = "",
      finished = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), 240000);
    child.stdout.on("data", chunk => {
      buffer += chunk.toString();
      if (buffer.length > 100000) buffer = buffer.slice(-100000);
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (line.startsWith("PROGRESS ")) {
          try {
            const p = JSON.parse(line.slice(9));
            g.phase = p.phase === "sewing" ? "Cucitura" : "Drappeggio";
            g.frame = p.frame;
            save(g);
          } catch {}
        }
      }
    });
    child.stderr.on("data", chunk => {
      errors = (errors + chunk.toString()).slice(-4000);
    });
    async function finish(code: number | null) {
      if (finished) return;
      finished = true;
      children.delete(child);
      clearTimeout(timer);
      try {
        const report = JSON.parse(
          await readFile(path.join(dir, "garment.report.json"), "utf8")
        ) as SimulationReport;
        await stat(path.join(dir, "garment.glb"));
        if (code !== 0) throw new Error("Blender non ha completato il job.");
        g.report = report;
        g.status =
          report.maxSeamGapMm > 10 ||
          report.weldedPairs / report.seamPairs < 0.98
            ? "needs-review"
            : "ready";
        g.phase = "Completato";
        g.frame = 75;
        g.error = undefined;
      } catch {
        g.status = "failed";
        g.error =
          "Simulazione non completata. Controlla geometrie, verso delle cuciture e disposizione. Il job viene interrotto dopo quattro minuti.";
        console.error("Garment worker failed", g.id, errors.slice(-600));
      }
      save(g);
      running = false;
      pump();
    }
    child.on("error", () => finish(null));
    child.on("close", finish);
  }
  api.get(
    "/garments/capabilities",
    h.wrap((req, res) => {
      h.owner(req);
      res.json(capabilities);
    })
  );
  api.get(
    "/garments",
    h.wrap((req, res) => {
      const a = h.actor(req);
      const garments = (
        db
          .prepare(
            "SELECT data FROM garments WHERE workspace_id=? ORDER BY rowid DESC"
          )
          .all(a.workspaceId) as { data: string }[]
      ).map(r => JSON.parse(r.data) as Garment);
      res.json(
        a.user.role === "owner"
          ? garments
          : garments
              .filter(g => g.published && g.status === "ready")
              .map(summary)
      );
    })
  );
  api.post(
    "/garments/import",
    h.wrap(async (req, res) => {
      const a = h.owner(req);
      h.limit(req, "dxf", 10, 3600000);
      if (!capabilities.dxf)
        h.fail(
          503,
          "Import DXF non disponibile. Installa Python ed ezdxf sul server."
        );
      const p = z
        .object({
          name: z.string().trim().min(2).max(80),
          text: z.string().max(10 * 1024 * 1024),
          units: z.enum(["auto", "mm", "cm", "m", "in"]),
        })
        .parse(req.body);
      if (p.text.startsWith("AutoCAD Binary"))
        h.fail(400, "Esporta un DXF ASCII. Il DXF binario non è supportato.");
      const id = randomUUID(),
        dir = path.join(root, id);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const input = path.join(dir, "source.dxf");
      await writeFile(input, p.text, { mode: 0o600 });
      let parsed: any;
      try {
        const result = await execute(
          python,
          [path.join(pipeline, "import_dxf.py"), input, p.units],
          { timeout: 30000, maxBuffer: 3 * 1024 * 1024 }
        );
        parsed = JSON.parse(result.stdout);
      } catch (e) {
        try {
          const detail = JSON.parse((e as any).stdout);
          h.fail(400, detail.error || "DXF non valido.");
        } catch (inner) {
          if ((inner as any)?.status) throw inner;
          h.fail(400, "DXF non valido o troppo complesso.");
        }
      }
      const g: Garment = {
        ...parsed,
        id,
        name: p.name,
        revision: 1,
        sourceHash: createHash("sha256").update(p.text).digest("hex"),
        status: "draft",
        published: false,
        seams: [],
        fabric: "performance-knit",
        contourType: "sewing",
        particleMm: 18,
        avatar: { chestMm: 960, waistMm: 830, heightMm: 1800 },
        createdAt: new Date().toISOString(),
      };
      db.prepare("INSERT INTO garments VALUES(?,?,?)").run(
        id,
        a.workspaceId,
        JSON.stringify(g)
      );
      res.status(201).json(g);
    })
  );
  api.get(
    "/garments/:id",
    h.wrap((req, res) => {
      const a = h.owner(req);
      res.json(get(req.params.id, a));
    })
  );
  api.put(
    "/garments/:id",
    h.wrap((req, res) => {
      const a = h.owner(req),
        g = get(req.params.id, a),
        p = assemblySchema.parse(req.body);
      if (["ready", "queued", "simulating"].includes(g.status))
        h.fail(
          409,
          "Questa revisione è congelata. Importa una nuova revisione per modificarla."
        );
      if (g.revision !== p.revision)
        h.fail(409, "Il capo è stato modificato. Ricarica.");
      if (
        new Set(p.panels.map(x => x.id)).size !== g.panels.length ||
        p.panels.length !== g.panels.length ||
        p.panels.some(x => !g.panels.some(y => y.id === x.id))
      )
        h.fail(400, "I pannelli devono corrispondere al DXF importato.");
      const next: Garment = {
        ...g,
        ...p,
        panels: g.panels.map(x => ({
          ...x,
          ...p.panels.find(y => y.id === x.id)!,
        })),
        revision: g.revision + 1,
        status: "draft",
        report: undefined,
        jobId: undefined,
        error: undefined,
      };
      save(next);
      res.json(next);
    })
  );
  api.post(
    "/garments/:id/simulate",
    h.wrap(async (req, res) => {
      const a = h.owner(req);
      h.limit(req, "simulate", 6, 3600000);
      const g = get(req.params.id, a);
      if (!capabilities.simulation)
        h.fail(503, "Blender non configurato sul server.");
      if (!["draft", "failed"].includes(g.status))
        h.fail(409, "Revisione già in elaborazione o congelata.");
      if (queue.length >= 8) h.fail(429, "Coda piena. Riprova più tardi.");
      const issues = validateAssembly(g);
      if (issues.length) h.fail(422, issues.join(" "));
      g.jobId = randomUUID();
      g.status = "queued";
      g.phase = "In coda";
      g.frame = 0;
      const dir = path.join(root, g.id, g.jobId);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(dir, "input.json"), JSON.stringify(g), {
        mode: 0o600,
      });
      save(g);
      queue.push({ g, workspaceId: a.workspaceId });
      res.status(202).json(g);
      pump();
    })
  );
  api.post(
    "/garments/:id/publish",
    h.wrap((req, res) => {
      const a = h.owner(req),
        g = get(req.params.id, a);
      z.object({ reviewed: z.literal(true) }).parse(req.body);
      if (g.status !== "ready")
        h.fail(
          422,
          "Solo una simulazione senza cuciture aperte può essere pubblicata."
        );
      g.published = true;
      save(g);
      res.json(g);
    })
  );
  api.get(
    "/garments/:id/asset",
    h.wrap(async (req, res) => {
      const a = h.actor(req),
        g = get(req.params.id, a);
      if (a.user.role !== "owner" && !g.published)
        h.fail(404, "Capo non disponibile.");
      if (!g.jobId || !["ready", "needs-review"].includes(g.status))
        h.fail(404, "Modello non disponibile.");
      res.type("model/gltf-binary");
      res.send(await readFile(path.join(root, g.id, g.jobId, "garment.glb")));
    })
  );
  api.get(
    "/garments/:id/source",
    h.wrap(async (req, res) => {
      const a = h.owner(req),
        g = get(req.params.id, a);
      res
        .type("application/dxf")
        .attachment("pattern.dxf")
        .send(await readFile(path.join(root, g.id, "source.dxf")));
    })
  );
}
