import { z } from "zod";
export const PANEL_ROLES = [
  "front",
  "back",
  "left-sleeve",
  "right-sleeve",
  "unassigned",
] as const;
export const panelConfigSchema = z.object({
  id: z.string().regex(/^p\d+$/),
  role: z.enum(PANEL_ROLES),
  enabled: z.boolean(),
  offset: z.tuple([
    z.number().min(-1000).max(1000),
    z.number().min(-1000).max(1000),
    z.number().min(-1000).max(1000),
  ]),
  rotation: z.number().min(-180).max(180),
});
const edge = z
  .object({
    panelId: z.string().regex(/^p\d+$/),
    start: z.number().int().min(0).max(1999),
    end: z.number().int().min(0).max(1999),
  })
  .refine(e => e.start !== e.end, "Seleziona due vertici diversi.");
export const seamSchema = z.object({
  id: z.string().min(1).max(40),
  a: edge,
  b: edge,
  reverse: z.boolean(),
});
export const assemblySchema = z.object({
  revision: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  panels: z.array(panelConfigSchema).min(2).max(32),
  seams: z.array(seamSchema).max(64),
  contourType: z.enum(["sewing", "cut"]),
  fabric: z.enum(["performance-knit", "interlock"]),
  particleMm: z.number().min(14).max(28),
  avatar: z.object({
    chestMm: z.number().min(700).max(1400),
    waistMm: z.number().min(600).max(1300),
    heightMm: z.number().min(1500).max(2100),
  }),
});
export type Panel = z.infer<typeof panelConfigSchema> & {
  name: string;
  layer: string;
  points: [number, number][];
  widthMm: number;
  heightMm: number;
  areaMm2: number;
};
export type Seam = z.infer<typeof seamSchema>;
export type SimulationReport = {
  engine: string;
  source: string;
  vertices: number;
  triangles: number;
  seamPairs: number;
  weldedPairs: number;
  maxSeamGapMm: number;
  durationSeconds: number;
  warnings: string[];
};
export type Garment = {
  id: string;
  name: string;
  revision: number;
  sourceHash: string;
  sourceUnits: string;
  scaleToMm: number;
  warnings: string[];
  panels: Panel[];
  seams: Seam[];
  fabric: "performance-knit" | "interlock";
  contourType: "sewing" | "cut";
  particleMm: number;
  avatar: { chestMm: number; waistMm: number; heightMm: number };
  status:
    | "draft"
    | "queued"
    | "simulating"
    | "ready"
    | "needs-review"
    | "failed";
  published: boolean;
  createdAt: string;
  phase?: string;
  frame?: number;
  error?: string;
  report?: SimulationReport;
  jobId?: string;
};
export type GarmentSummary = Pick<
  Garment,
  "id" | "name" | "status" | "published" | "createdAt" | "report" | "revision"
>;
export const roleNames: Record<(typeof PANEL_ROLES)[number], string> = {
  front: "Davanti",
  back: "Dietro",
  "left-sleeve": "Manica sinistra",
  "right-sleeve": "Manica destra",
  unassigned: "Da assegnare",
};
export function edgeIndices(panel: Panel, ref: Seam["a"]) {
  const ids: number[] = [];
  let i = ref.start;
  for (let n = 0; n <= panel.points.length; n++) {
    ids.push(i);
    if (i === ref.end) return ids;
    i = (i + 1) % panel.points.length;
  }
  return [];
}
export function edgeLength(panel: Panel, ref: Seam["a"]) {
  const ids = edgeIndices(panel, ref);
  return ids
    .slice(1)
    .reduce(
      (s, id, i) =>
        s +
        Math.hypot(
          panel.points[id][0] - panel.points[ids[i]][0],
          panel.points[id][1] - panel.points[ids[i]][1]
        ),
      0
    );
}
export function validateAssembly(
  g: Pick<Garment, "panels" | "seams" | "contourType">
) {
  const issues: string[] = [];
  const enabled = g.panels.filter(p => p.enabled),
    roles = enabled.map(p => p.role);
  if (g.contourType !== "sewing")
    issues.push(
      "La simulazione richiede linee di cucitura. Le linee di taglio con margini non equivalgono alle linee di cucitura."
    );
  if (
    enabled.length !== 4 ||
    new Set(roles).size !== 4 ||
    roles.includes("unassigned")
  )
    issues.push(
      "Il profilo calcio supporta quattro pannelli: davanti, dietro e due maniche. Assegna ciascun ruolo una volta."
    );
  if (g.seams.length < 4) issues.push("Definisci le cuciture fra i pannelli.");
  const used = new Set<string>();
  for (const s of g.seams) {
    const a = enabled.find(p => p.id === s.a.panelId),
      b = enabled.find(p => p.id === s.b.panelId);
    if (
      !a ||
      !b ||
      s.a.end >= a.points.length ||
      s.a.start >= a.points.length ||
      s.b.end >= b.points.length ||
      s.b.start >= b.points.length
    ) {
      issues.push(
        "Una cucitura fa riferimento a un pannello o vertice non valido."
      );
      continue;
    }
    const la = edgeLength(a, s.a),
      lb = edgeLength(b, s.b);
    if (Math.min(la, lb) < 1 || Math.max(la, lb) / Math.min(la, lb) > 1.35)
      issues.push(
        `Cucitura ${s.id}: lunghezze incompatibili (${Math.round(la)} / ${Math.round(lb)} mm).`
      );
    for (const ref of [s.a, s.b]) {
      const p = enabled.find(p => p.id === ref.panelId)!;
      for (const index of edgeIndices(p, ref).slice(0, -1)) {
        const key = p.id + ":" + index;
        if (used.has(key)) issues.push("Un bordo è usato da più cuciture.");
        used.add(key);
      }
    }
  }
  const counts = new Map<string, number>();
  for (const seam of g.seams) {
    const a = enabled.find(p => p.id === seam.a.panelId)?.role,
      b = enabled.find(p => p.id === seam.b.panelId)?.role;
    if (a && b) {
      const key = [a, b].sort().join("|");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  for (const [a, b, minimum] of [
    ["front", "back", 4],
    ["front", "left-sleeve", 1],
    ["back", "left-sleeve", 1],
    ["left-sleeve", "left-sleeve", 1],
    ["front", "right-sleeve", 1],
    ["back", "right-sleeve", 1],
    ["right-sleeve", "right-sleeve", 1],
  ] as const) {
    if ((counts.get([a, b].sort().join("|")) || 0) < minimum)
      issues.push(
        `Connessione mancante: ${roleNames[a]} ↔ ${roleNames[b]} (${minimum} cuciture).`
      );
  }
  return [...new Set(issues)];
}
