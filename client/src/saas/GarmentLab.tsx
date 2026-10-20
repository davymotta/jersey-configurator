import { lazy, Suspense, useEffect, useState } from "react";
import {
  Upload,
  ArrowUpRight,
  Play,
  Save,
  Plus,
  Trash2,
  Check,
  ScanLine,
  Layers,
  RotateCcw,
  Download,
  Loader2,
  FileCode2,
  Move3D,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "./api";
import { Field, Empty, Badge } from "../App";
import { DEFAULT_DESIGN } from "@shared/production";
import {
  roleNames,
  edgeIndices,
  edgeLength,
  validateAssembly,
  type Garment,
  type Panel,
  type Seam,
} from "@shared/garment";
const Viewer = lazy(() => import("./Jersey3D"));
const firstSeam = (): Seam => ({
  id: crypto.randomUUID(),
  a: { panelId: "p1", start: 0, end: 1 },
  b: { panelId: "p2", start: 0, end: 1 },
  reverse: false,
});
export default function GarmentLab() {
  const [garments, setGarments] = useState<Garment[]>([]),
    [g, setG] = useState<Garment>(),
    [panelId, setPanelId] = useState("p1"),
    [units, setUnits] = useState("auto"),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [seam, setSeam] = useState<Seam>(firstSeam),
    [pick, setPick] = useState<"a.start" | "a.end" | "b.start" | "b.end">(
      "a.start"
    ),
    [view, setView] = useState("2d"),
    [cap, setCap] = useState<{ dxf: boolean; simulation: boolean }>();
  const panel = g?.panels.find(p => p.id === panelId),
    locked = !!g && ["queued", "simulating", "ready"].includes(g.status),
    issues = g ? validateAssembly(g) : [];
  async function load() {
    try {
      setGarments(await api<Garment[]>("/garments"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    api<{ dxf: boolean; simulation: boolean }>("/garments/capabilities")
      .then(setCap)
      .catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!g || !["queued", "simulating"].includes(g.status)) return;
    let active = true;
    const timer = setInterval(() => {
      api<Garment>(`/garments/${g.id}`)
        .then(n => {
          if (active) {
            setG(n);
            if (!["queued", "simulating"].includes(n.status)) {
              load();
              setView("3d");
            }
          }
        })
        .catch(e => {
          if (active) setError(e.message);
        });
    }, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [g?.id, g?.status]);
  function change(p: Partial<Garment>) {
    setG(prev => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  }
  function changePanel(p: Partial<Panel>) {
    if (g)
      change({
        panels: g.panels.map(x => (x.id === panelId ? { ...x, ...p } : x)),
      });
  }
  async function upload(text: string, name: string, example = false) {
    setBusy(true);
    setError("");
    try {
      let result = await api<Garment>("/garments/import", "POST", {
        text,
        name,
        units: example ? "mm" : units,
      });
      if (example) {
        const recipe = await fetch("/samples/dreamteam-training.json").then(r =>
          r.json()
        );
        result = await api<Garment>(`/garments/${result.id}`, "PUT", {
          ...result,
          ...recipe,
          revision: result.revision,
          panels: result.panels.map(p => ({
            ...p,
            role:
              recipe.panels.find((x: Panel) => x.layer === p.layer)?.role ||
              "unassigned",
          })),
        });
      }
      setG(result);
      setPanelId(result.panels[0].id);
      setDirty(false);
      setView("2d");
      await load();
      toast.success("DXF importato. Verifica pannelli e cuciture.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!g) return;
    const next = await api<Garment>(`/garments/${g.id}`, "PUT", g);
    setG(next);
    setDirty(false);
    await load();
    return next;
  }
  async function simulate() {
    if (!g) return;
    setBusy(true);
    setError("");
    try {
      const next = dirty ? await save() : g;
      if (!next) return;
      const result = await api<Garment>(
        `/garments/${next.id}/simulate`,
        "POST",
        {}
      );
      setG(result);
      setDirty(false);
      toast.success("Simulazione avviata sul worker.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function pickVertex(index: number) {
    if (locked || !panel) return;
    const [side, point] = pick.split(".") as ["a" | "b", "start" | "end"];
    setSeam(s => ({
      ...s,
      [side]: { ...s[side], panelId: panel.id, [point]: index },
    }));
    setPick(
      pick === "a.start"
        ? "a.end"
        : pick === "a.end"
          ? "b.start"
          : pick === "b.start"
            ? "b.end"
            : "a.start"
    );
  }
  const statusNames = {
    draft: "Da configurare",
    queued: "In coda",
    simulating: "Simulazione in corso",
    ready: "Da verificare",
    "needs-review": "Cuciture da correggere",
    failed: "Simulazione interrotta",
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DREAMTEAM / PATTERN ENGINE</span>
          <h1>Dal piano. Al campo.</h1>
          <p>
            Importa il tuo DXF, definisci le cuciture e prova il drappeggio
            della divisa. Funzione sperimentale.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy || !cap?.dxf}
          onClick={async () => {
            try {
              const text = await fetch("/samples/dreamteam-training.dxf").then(
                r => r.text()
              );
              await upload(text, "DreamTeam / Training sample", true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Play size={15} />
          Apri capo di prova
        </button>
      </div>
      <div className="dxf-upload-bar">
        <div>
          <FileCode2 size={24} />
          <div>
            <strong>Il tuo cartamodello, senza ridisegnarlo.</strong>
            <small>
              DXF ASCII · contorni chiusi · una taglia · massimo 10 MB
            </small>
          </div>
        </div>
        <select
          aria-label="Unità del DXF"
          value={units}
          onChange={e => setUnits(e.target.value)}
        >
          {[
            ["auto", "Unità dal file"],
            ["mm", "Millimetri"],
            ["cm", "Centimetri"],
            ["m", "Metri"],
            ["in", "Pollici"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="btn primary">
          <Upload size={15} />
          {busy ? "Elaborazione…" : "Importa DXF"}
          <input
            className="visually-hidden"
            type="file"
            accept=".dxf"
            disabled={busy || !cap?.dxf}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 10 * 1024 * 1024)
                  setError("Il DXF supera 10 MB.");
                else
                  await upload(
                    await file.text(),
                    file.name.replace(/\.dxf$/i, "")
                  );
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {cap && (!cap.dxf || !cap.simulation) && (
        <p className="info-note">
          {!cap.dxf
            ? "Importer non disponibile: installa Python + ezdxf. "
            : ""}
          {!cap.simulation
            ? "Worker non disponibile: configura Blender sul server."
            : ""}{" "}
          Le funzioni non vengono simulate nel browser.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {garments.length > 0 && (
        <div className="garment-tabs">
          {garments.map(x => (
            <button
              className={g?.id === x.id ? "selected" : ""}
              key={x.id}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "Le modifiche non salvate andranno perse. Continuare?"
                  )
                )
                  return;
                setG(x);
                setPanelId(x.panels[0].id);
                setDirty(false);
                setView(x.report ? "3d" : "2d");
                setError("");
              }}
            >
              <Layers size={13} />
              {x.name}
              <span>{x.published ? "Pubblicato" : statusNames[x.status]}</span>
            </button>
          ))}
        </div>
      )}
      {g ? (
        <>
          <div className="lab-heading">
            <div>
              <input
                aria-label="Nome del capo"
                disabled={locked}
                value={g.name}
                onChange={e => change({ name: e.target.value })}
              />
              <Badge green={g.published}>
                {g.published ? "Pubblicato" : statusNames[g.status]}
              </Badge>
              <span className="subtle">
                Rev. {g.revision} · {g.sourceUnits} → mm
              </span>
            </div>
            <div className="button-row">
              <a
                className="btn secondary"
                href={`/api/garments/${g.id}/source`}
              >
                <Download size={14} />
                DXF originale
              </a>
              <button
                className="btn secondary"
                disabled={busy || locked || !dirty}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await save();
                    toast.success("Configurazione salvata.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Save size={14} />
                Salva
              </button>
              <button
                className="btn primary"
                disabled={
                  busy || locked || issues.length > 0 || !cap?.simulation
                }
                onClick={simulate}
              >
                <Play size={14} />
                Simula capo
              </button>
            </div>
          </div>
          <div className="garment-lab">
            <aside className="lab-pieces">
              <span className="control-section">
                PANNELLI / {g.panels.filter(p => p.enabled).length}
              </span>
              {g.panels.map(p => (
                <button
                  className={`panel-item ${panelId === p.id ? "selected" : ""} ${!p.enabled ? "disabled-panel" : ""}`}
                  key={p.id}
                  onClick={() => setPanelId(p.id)}
                >
                  <svg viewBox={`-10 -10 ${p.widthMm + 20} ${p.heightMm + 20}`}>
                    <polygon
                      points={p.points.map(p => p.join(",")).join(" ")}
                    />
                  </svg>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.role === "unassigned"
                        ? "Da assegnare"
                        : roleNames[p.role]}
                    </small>
                    <small>
                      {Math.round(p.widthMm)} × {Math.round(p.heightMm)} mm
                    </small>
                  </span>
                  <span className="panel-id">{p.id.toUpperCase()}</span>
                </button>
              ))}
              <div className="lab-profile">
                <span className="control-section">PROFILO CALCIO / V1</span>
                <p>
                  Davanti + dietro + due maniche montate. Escludi contorni di
                  taglio duplicati e annotazioni.
                </p>
                <p>
                  Colletti, inserti e costruzioni raglan richiedono un profilo
                  di assemblaggio dedicato.
                </p>
              </div>
            </aside>
            <section className="lab-canvas">
              <div className="lab-canvas-toolbar">
                <span>
                  <ScanLine size={14} />
                  {view === "2d" ? "PATTERN WORKSPACE" : "SIMULATED GARMENT"}
                </span>
                <div className="segmented small">
                  <button
                    className={view === "2d" ? "selected" : ""}
                    onClick={() => setView("2d")}
                  >
                    2D / Pannelli
                  </button>
                  <button
                    disabled={!g.report}
                    className={view === "3d" ? "selected" : ""}
                    onClick={() => setView("3d")}
                  >
                    3D / Capo
                  </button>
                </div>
              </div>
              {view === "3d" && g.report ? (
                <div className="lab-model">
                  <Suspense
                    fallback={
                      <div className="render-loading">Caricamento…</div>
                    }
                  >
                    <Viewer
                      design={{
                        ...DEFAULT_DESIGN,
                        primary: "#e9e9e4",
                        secondary: "#30353e",
                        accent: "#c8f6ff",
                        team: "DREAMTEAM FC",
                      }}
                      assetUrl={`/api/garments/${g.id}/asset`}
                    />
                  </Suspense>
                </div>
              ) : panel ? (
                <div className="pattern-canvas">
                  <div className="pattern-dimensions">
                    <span>
                      {panel.name} / {panel.id.toUpperCase()}
                    </span>
                    <strong>
                      {Math.round(panel.widthMm)} × {Math.round(panel.heightMm)}{" "}
                      MM
                    </strong>
                  </div>
                  <svg
                    viewBox={`-60 -60 ${panel.widthMm + 120} ${panel.heightMm + 120}`}
                    role="img"
                    aria-label={`Pannello ${panel.name}, seleziona i vertici per le cuciture`}
                  >
                    <polygon
                      className="panel-face"
                      points={panel.points.map(p => p.join(",")).join(" ")}
                    />
                    {g.seams.map((s, i) =>
                      [s.a, s.b]
                        .filter(r => r.panelId === panel.id)
                        .map((r, j) => (
                          <polyline
                            key={s.id + j}
                            className="sewn-edge"
                            style={{
                              stroke: [
                                "#66cddd",
                                "#db8955",
                                "#a3a6ed",
                                "#b9c886",
                              ][i % 4],
                            }}
                            points={edgeIndices(panel, r)
                              .map(k => panel.points[k].join(","))
                              .join(" ")}
                          />
                        ))
                    )}
                    {[seam.a, seam.b]
                      .filter(
                        r =>
                          r.panelId === panel.id && r.end < panel.points.length
                      )
                      .map((r, j) => (
                        <polyline
                          className="active-edge"
                          key={j}
                          points={edgeIndices(panel, r)
                            .map(k => panel.points[k].join(","))
                            .join(" ")}
                        />
                      ))}
                    {panel.points.map(([x, y], i) => (
                      <g
                        key={i}
                        className="pattern-vertex"
                        onClick={() => pickVertex(i)}
                      >
                        <circle cx={x} cy={y} r={5}>
                          <title>Vertice {i}</title>
                        </circle>
                        <text x={x + 9} y={y - 9}>
                          {i}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="pattern-canvas-hint">
                    <span>1:1 / mm</span>
                    <span>Seleziona in ordine inizio e fine dei due bordi</span>
                  </div>
                </div>
              ) : null}
              {["queued", "simulating"].includes(g.status) && (
                <div className="simulation-progress">
                  <Loader2 size={17} className="spin" />
                  <div>
                    <strong>{g.phase}</strong>
                    <span>
                      Il worker cuce i pannelli e calcola il drappeggio.
                    </span>
                    <progress value={g.frame || 0} max={75} />
                  </div>
                  <small>{g.frame || 0}/75</small>
                </div>
              )}
              <div className="lab-seams">
                <div className="section-heading">
                  <h3>
                    Cuciture{" "}
                    <span>{g.seams.length.toString().padStart(2, "0")}</span>
                  </h3>
                  <span className="subtle">
                    I bordi seguono l’ordine dei vertici lungo il contorno.
                  </span>
                </div>
                {g.seams.length ? (
                  <div className="seam-list">
                    {g.seams.map((s, i) => {
                      const a = g.panels.find(p => p.id === s.a.panelId)!,
                        b = g.panels.find(p => p.id === s.b.panelId)!;
                      return (
                        <div key={s.id}>
                          <span className="seam-index">
                            {(i + 1).toString().padStart(2, "0")}
                          </span>
                          <strong>
                            {s.a.panelId.toUpperCase()} [{s.a.start}→{s.a.end}]
                          </strong>
                          <span>↔</span>
                          <strong>
                            {s.b.panelId.toUpperCase()} [{s.b.start}→{s.b.end}]
                          </strong>
                          <small>
                            {Math.round(edgeLength(a, s.a))} /{" "}
                            {Math.round(edgeLength(b, s.b))} mm
                          </small>
                          <button
                            className="icon-button"
                            disabled={locked}
                            aria-label={`Elimina cucitura ${i + 1}`}
                            onClick={() =>
                              change({
                                seams: g.seams.filter(x => x.id !== s.id),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="subtle">
                    Nessuna cucitura. Definisci i bordi nel pannello a destra.
                  </p>
                )}
              </div>
            </section>
            <aside className="lab-inspector">
              {panel && (
                <>
                  <span className="control-section">PANNELLO SELEZIONATO</span>
                  <h3>{panel.name}</h3>
                  <Field label="Ruolo nella divisa">
                    <select
                      disabled={locked}
                      value={panel.role}
                      onChange={e =>
                        changePanel({ role: e.target.value as Panel["role"] })
                      }
                    >
                      {Object.entries(roleNames).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="checkbox-label">
                    <input
                      disabled={locked}
                      type="checkbox"
                      checked={panel.enabled}
                      onChange={e => changePanel({ enabled: e.target.checked })}
                    />
                    Includi questo pannello
                  </label>
                  <details>
                    <summary>
                      <Move3D size={13} />
                      Disposizione iniziale
                    </summary>
                    <div className="offset-fields">
                      {["X", "Y", "Z"].map((axis, i) => (
                        <Field label={`${axis} (mm)`} key={axis}>
                          <input
                            type="number"
                            disabled={locked}
                            min={-1000}
                            max={1000}
                            value={panel.offset[i]}
                            onChange={e =>
                              changePanel({
                                offset: panel.offset.map((x, j) =>
                                  j === i ? Number(e.target.value) : x
                                ) as [number, number, number],
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <Field label="Rotazione intorno al corpo (°)">
                      <input
                        type="number"
                        disabled={locked}
                        min={-180}
                        max={180}
                        value={panel.rotation}
                        onChange={e =>
                          changePanel({ rotation: Number(e.target.value) })
                        }
                      />
                    </Field>
                  </details>
                </>
              )}
              <span className="control-section">NUOVA CUCITURA</span>
              {(["a", "b"] as const).map(side => (
                <div className="seam-side" key={side}>
                  <div>
                    <strong>Bordo {side.toUpperCase()}</strong>
                    <select
                      aria-label={`Pannello bordo ${side}`}
                      disabled={locked}
                      value={seam[side].panelId}
                      onChange={e => {
                        setSeam(s => ({
                          ...s,
                          [side]: {
                            ...s[side],
                            panelId: e.target.value,
                            start: 0,
                            end: 1,
                          },
                        }));
                        setPanelId(e.target.value);
                      }}
                    >
                      {g.panels
                        .filter(p => p.enabled)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id.toUpperCase()} / {roleNames[p.role]}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="seam-points">
                    {(["start", "end"] as const).map(point => (
                      <label
                        className={pick === `${side}.${point}` ? "picking" : ""}
                        key={point}
                        onClick={() => {
                          setPick(`${side}.${point}`);
                          setPanelId(seam[side].panelId);
                        }}
                      >
                        <span>{point === "start" ? "Inizio" : "Fine"}</span>
                        <input
                          type="number"
                          min={0}
                          disabled={locked}
                          max={
                            (g.panels.find(p => p.id === seam[side].panelId)
                              ?.points.length || 1) - 1
                          }
                          value={seam[side][point]}
                          onChange={e =>
                            setSeam(s => ({
                              ...s,
                              [side]: {
                                ...s[side],
                                [point]: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={seam.reverse}
                  disabled={locked}
                  onChange={e =>
                    setSeam(s => ({ ...s, reverse: e.target.checked }))
                  }
                />
                Inverti il verso del bordo B
              </label>
              <button
                className="btn secondary full"
                disabled={locked}
                onClick={() => {
                  change({
                    seams: [...g.seams, { ...seam, id: crypto.randomUUID() }],
                  });
                  setSeam(firstSeam());
                }}
              >
                <Plus size={14} />
                Aggiungi cucitura
              </button>
              <span className="control-section">SIMULAZIONE</span>
              <Field label="Contorni importati">
                <select
                  disabled={locked}
                  value={g.contourType}
                  onChange={e =>
                    change({
                      contourType: e.target.value as Garment["contourType"],
                    })
                  }
                >
                  <option value="sewing">Linee di cucitura</option>
                  <option value="cut">Linee di taglio / solo ispezione</option>
                </select>
              </Field>
              <Field label="Tessuto di sviluppo">
                <select
                  disabled={locked}
                  value={g.fabric}
                  onChange={e =>
                    change({ fabric: e.target.value as Garment["fabric"] })
                  }
                >
                  <option value="performance-knit">Performance knit</option>
                  <option value="interlock">Interlock</option>
                </select>
              </Field>
              <Field label="Distanza particelle (mm)">
                <input
                  type="number"
                  min={14}
                  max={28}
                  disabled={locked}
                  value={g.particleMm}
                  onChange={e => change({ particleMm: Number(e.target.value) })}
                />
              </Field>
              <details>
                <summary>Misure del busto di prova</summary>
                {[
                  ["chestMm", "Torace"],
                  ["waistMm", "Vita"],
                  ["heightMm", "Altezza"],
                ].map(([key, label]) => (
                  <Field key={key} label={`${label} (mm)`}>
                    <input
                      disabled={locked}
                      type="number"
                      value={g.avatar[key as keyof Garment["avatar"]]}
                      onChange={e =>
                        change({
                          avatar: {
                            ...g.avatar,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </details>
            </aside>
          </div>
          {issues.length > 0 && (
            <div className="assembly-issues">
              <strong>Prima di simulare</strong>
              {issues.map(x => (
                <p key={x}>{x}</p>
              ))}
            </div>
          )}
          {g.report && (
            <section className="simulation-report">
              <div>
                <span className="eyebrow">SIMULATION REPORT</span>
                <h2>Geometrie reali. Risultati misurati.</h2>
                <p>
                  {g.report.engine} · {g.report.durationSeconds.toFixed(1)} s
                </p>
              </div>
              <div className="report-metrics">
                <span>
                  <strong>{g.report.vertices.toLocaleString()}</strong>Vertici
                  simulati
                </span>
                <span>
                  <strong>
                    {g.report.weldedPairs}/{g.report.seamPairs}
                  </strong>
                  Campioni saldati
                </span>
                <span>
                  <strong>{g.report.maxSeamGapMm} mm</strong>Gap prima della
                  saldatura
                </span>
              </div>
              {g.report.warnings.map(w => (
                <p className="info-note" key={w}>
                  {w}
                </p>
              ))}
              {g.status === "ready" && !g.published && (
                <label className="publish-model">
                  <input
                    type="checkbox"
                    onChange={async e => {
                      const checkbox = e.currentTarget;
                      if (!checkbox.checked) return;
                      try {
                        const result = await api<Garment>(
                          `/garments/${g.id}/publish`,
                          "POST",
                          { reviewed: true }
                        );
                        setG(result);
                        await load();
                        toast.success("Capo disponibile nel design studio.");
                      } catch (e) {
                        setError((e as Error).message);
                        checkbox.checked = false;
                      }
                    }}
                  />
                  Ho verificato visivamente cuciture, orientamento delle
                  grafiche e risultato 3D. Pubblica questa revisione nel
                  configuratore.
                </label>
              )}
            </section>
          )}
          <details className="import-warnings">
            <summary>Informazioni sull’importazione DXF</summary>
            {g.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            <p>Impronta del file: {g.sourceHash}</p>
            <p>
              La simulazione non approva il cartamodello per il taglio o la
              vestibilità. Mantieni separata la verifica dei margini di cucitura
              e della prestampa.
            </p>
          </details>
        </>
      ) : (
        <Empty
          title="Ogni grande kit nasce da un buon cartamodello."
          description="Importa i tuoi pannelli o usa il capo di prova per esplorare un flusso completo di cucitura e simulazione."
        />
      )}
    </>
  );
}
