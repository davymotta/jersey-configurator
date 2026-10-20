import { z } from "zod";
import { svgPathBbox } from "svg-path-bbox";

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
export const CATEGORIES = ["football", "cricket", "corporate"] as const;
export const STATUS_LABELS = {
  submitted: "Da approvare",
  approved: "Approvato",
  production: "In produzione",
  shipped: "Spedito",
  cancelled: "Annullato",
} as const;
export type Status = keyof typeof STATUS_LABELS;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const designSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  pattern: z.enum(["solid", "diagonal", "stripes", "wave"]),
  primary: hex,
  secondary: hex,
  accent: hex,
  textColor: hex,
  team: z.string().trim().max(32),
  number: z.string().regex(/^\d{0,3}$/),
  player: z.string().trim().max(24),
  prompt: z.string().max(1500).default(""),
  artworkId: z.string().uuid().nullable().default(null),
  garmentId: z.string().uuid().nullable().default(null),
});
export type Design = z.infer<typeof designSchema>;
export type SavedDesign = Design & {
  id: string;
  updatedAt: string;
  revision: number;
};
export const DEFAULT_DESIGN: Design = {
  name: "Nuova divisa",
  category: "football",
  pattern: "diagonal",
  primary: "#12392e",
  secondary: "#d5ec7b",
  accent: "#f6f4ea",
  textColor: "#ffffff",
  team: "DREAMTEAM FC",
  player: "ROSSI",
  number: "10",
  prompt: "",
  artworkId: null,
  garmentId: null,
};
const svgPath = z
  .string()
  .min(5)
  .max(20000)
  .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+\-eE]+$/);
export const patternSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  revision: z.string().trim().min(1).max(32),
  fabric: z.string().trim().min(1).max(120),
  bleedMm: z.number().min(2).max(30),
  minDpi: z.number().int().min(72).max(600),
  approved: z.literal(true),
  sizes: z
    .array(
      z.object({
        size: z.enum(SIZES),
        pieces: z
          .array(
            z
              .object({
                key: z.enum(["front", "back", "left-sleeve", "right-sleeve"]),
                widthMm: z.number().positive().max(2000),
                heightMm: z.number().positive().max(2000),
                cutPath: svgPath,
              })
              .refine(p => {
                try {
                  const [x, y, x2, y2] = svgPathBbox(p.cutPath);
                  return (
                    [x, y, x2, y2].every(Number.isFinite) &&
                    x >= -0.1 &&
                    y >= -0.1 &&
                    x2 <= p.widthMm + 0.1 &&
                    y2 <= p.heightMm + 0.1 &&
                    x2 > x &&
                    y2 > y &&
                    /[zZ]\s*$/.test(p.cutPath)
                  );
                } catch {
                  return false;
                }
              }, "Il contorno deve essere chiuso, valido e contenuto nelle misure del pannello")
          )
          .length(4)
          .refine(
            p => new Set(p.map(x => x.key)).size === 4,
            "Servono quattro pannelli diversi"
          ),
      })
    )
    .min(1)
    .max(7)
    .refine(
      s => new Set(s.map(x => x.size)).size === s.length,
      "Taglie duplicate"
    ),
});
export type Pattern = z.infer<typeof patternSchema>;
export type SavedPattern = Pattern & {
  id: string;
  hash: string;
  createdAt: string;
};
export const orderSchema = z
  .object({
    designId: z.string().uuid(),
    customer: z.string().trim().min(2).max(100),
    email: z.email(),
    address: z.string().trim().min(10).max(500),
    notes: z.string().trim().max(1000),
    quantities: z.record(z.enum(SIZES), z.number().int().min(0).max(10000)),
    confirmed: z.literal(true),
  })
  .refine(
    x => Object.values(x.quantities).reduce((a, b) => a + b, 0) > 0,
    "Seleziona almeno una taglia"
  );
export type OrderInput = z.infer<typeof orderSchema>;
export type Order = Omit<OrderInput, "designId" | "confirmed"> & {
  id: string;
  reference: string;
  design: SavedDesign;
  createdAt: string;
  status: Status;
  total: number;
  quantity: number;
  pattern: SavedPattern | null;
  history: { status: Status; at: string }[];
};
export type Session = {
  user: { id: string; name: string; email: string; role: "owner" | "customer" };
  workspace: {
    id: string;
    name: string;
    slug: string;
    unitPrice: number;
    minimum: number;
    demo: boolean;
  };
  aiEnabled: boolean;
};
export const transitions: Record<Status, Status[]> = {
  submitted: ["approved", "cancelled"],
  approved: ["production", "cancelled"],
  production: ["shipped"],
  shipped: [],
  cancelled: [],
};
export function totalQuantity(q: Record<string, number>) {
  return Object.values(q).reduce((a, b) => a + b, 0);
}
export function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    c =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!
  );
}

// One vector artwork is shared by 2D, 3D and physical panel export.
export function artworkSvg(
  d: Design,
  back = false,
  imageData?: string,
  sleeve = false
): string {
  const motif =
    d.pattern === "diagonal"
      ? `<path d="M-150 0H40L750 1000H560Z" fill="${d.secondary}"/><path d="M80 0h14l710 1000h-14Z" fill="${d.accent}"/>`
      : d.pattern === "stripes"
        ? [40, 160, 280, 400, 520]
            .map(
              x =>
                `<rect x="${x}" width="48" height="1000" fill="${d.secondary}"/>`
            )
            .join("")
        : d.pattern === "wave"
          ? `<path d="M0 450Q150 250 300 450T600 450V1000H0Z" fill="${d.secondary}"/><path d="M0 530Q150 330 300 530T600 530" fill="none" stroke="${d.accent}" stroke-width="8"/>`
          : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 1000"><rect width="600" height="1000" fill="${d.primary}"/>${imageData ? `<image href="${imageData}" xlink:href="${imageData}" width="600" height="1000" preserveAspectRatio="xMidYMid slice"/>` : motif}${sleeve ? "" : `<g fill="${d.textColor}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold"><text x="300" y="${back ? 190 : 310}" font-size="32" textLength="${back ? Math.max(d.player.length * 22, 1) : Math.max(d.team.length * 19, 1)}" lengthAdjust="spacingAndGlyphs">${escapeXml(back ? d.player : d.team)}</text>${back ? `<text x="300" y="540" font-size="260">${escapeXml(d.number)}</text>` : `<path d="M265 160h70v60l-35 20-35-20Z" fill="${d.accent}"/><text x="300" y="202" font-size="24" fill="${d.primary}">DT</text>`}</g>`}</svg>`;
}
export function panelSvg(
  d: Design,
  piece: Pattern["sizes"][number]["pieces"][number],
  pattern: Pattern,
  imageData?: string
) {
  const { widthMm: w, heightMm: h, cutPath, key } = piece,
    b = pattern.bleedMm;
  const art = artworkSvg(
    d,
    key === "back",
    imageData,
    key.includes("sleeve")
  ).replace(
    "<svg ",
    `<svg x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" `
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w + 2 * b}mm" height="${h + 2 * b}mm" viewBox="${-b} ${-b} ${w + 2 * b} ${h + 2 * b}"><title>${escapeXml(d.name)} — ${key}</title><defs><mask id="panel" maskUnits="userSpaceOnUse" x="${-b}" y="${-b}" width="${w + 2 * b}" height="${h + 2 * b}"><path d="${cutPath}" fill="white" stroke="white" stroke-width="${b * 2}" stroke-linejoin="round"/></mask></defs><g mask="url(#panel)">${art.replace('x="0" y="0"', `x="${-b}" y="${-b}"`).replace(`width="${w}" height="${h}"`, `width="${w + 2 * b}" height="${h + 2 * b}"`)}</g><g id="CUT_GUIDE_REMOVE_BEFORE_RIP"><path d="${cutPath}" fill="none" stroke="#ff00ff" stroke-width="0.2" stroke-dasharray="3 2"/></g></svg>`;
}
