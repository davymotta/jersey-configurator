import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Save,
  ShoppingBag,
  Sparkles,
  Box,
  Layers,
  RotateCcw,
  ArrowRight,
  X,
  Loader2,
  Check,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_DESIGN,
  SIZES,
  artworkSvg,
  type Design,
  type SavedDesign,
  type Session,
} from "@shared/production";
import { FlatJersey } from "./Preview";
const Jersey3D = lazy(() => import("./Jersey3D"));
import { api, download, money } from "./api";
import { Field, Empty, categoryNames } from "../App";

export default function Studio({
  session,
  designs,
  refresh,
}: {
  session: Session;
  designs: SavedDesign[];
  refresh: () => void;
}) {
  const [path, navigate] = useLocation(),
    id = path.split("/")[2],
    existing = designs.find(d => d.id === id);
  const [design, setDesign] = useState<Design>(
      existing || { ...DEFAULT_DESIGN }
    ),
    [saved, setSaved] = useState<SavedDesign | undefined>(existing),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("design"),
    [view, setView] = useState<"3d" | "front" | "back">("3d"),
    [imageData, setImageData] = useState<string>(),
    [aiBusy, setAiBusy] = useState(false),
    [orderOpen, setOrderOpen] = useState(false);
  const hydrated = useRef(!!existing);
  useEffect(() => {
    if (existing && !hydrated.current) {
      setDesign(existing);
      setSaved(existing);
      hydrated.current = true;
    }
  }, [existing]);
  useEffect(() => {
    if (!design.artworkId) {
      setImageData(undefined);
      return;
    }
    let current = true;
    api<{ data: string }>(`/artwork/${design.artworkId}`)
      .then(r => {
        if (current) setImageData(r.data);
      })
      .catch(e => toast.error(e.message));
    return () => {
      current = false;
    };
  }, [design.artworkId]);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  function update(p: Partial<Design>) {
    setDesign(d => ({ ...d, ...p }));
    setDirty(true);
  }
  async function save() {
    setBusy(true);
    try {
      const result = await api<SavedDesign>(
        saved ? `/designs/${saved.id}` : "/designs",
        saved ? "PUT" : "POST",
        saved ? { ...design, revision: saved.revision } : design
      );
      setSaved(result);
      setDirty(false);
      refresh();
      toast.success("Design salvato.");
      return result;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (id && !existing && !saved)
    return (
      <Empty
        title="Design non disponibile"
        description="Caricamento della libreria, oppure il design non appartiene al tuo account."
      >
        <Link className="btn secondary" href="/designs">
          Torna ai design
        </Link>
      </Empty>
    );
  return (
    <>
      <div className="page-heading studio-heading">
        <div>
          <span className="eyebrow">DOVE LE IDEE PRENDONO FORMA</span>
          <h1>
            Design studio{" "}
            <span className="badge">
              {dirty
                ? "Modifiche da salvare"
                : saved
                  ? "Salvato"
                  : "Nuovo progetto"}
            </span>
          </h1>
        </div>
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={busy || aiBusy}
            onClick={() =>
              save()
                .then(d => navigate(`/studio/${d.id}`))
                .catch(() => {})
            }
          >
            <Save size={16} />
            {busy ? "Salvataggio…" : "Salva design"}
          </button>
          <button
            className="btn primary"
            disabled={busy || aiBusy}
            onClick={() => setOrderOpen(true)}
          >
            <ShoppingBag size={16} />
            Richiedi ordine
          </button>
        </div>
      </div>
      <div className="studio-layout">
        <aside className="studio-panel">
          <div className="studio-tabs">
            {[
              ["design", "Design"],
              ["text", "Dettagli"],
              ["ai", "AI studio"],
            ].map(([v, l]) => (
              <button
                className={tab === v ? "selected" : ""}
                key={v}
                onClick={() => setTab(v)}
              >
                {v === "ai" && <Sparkles size={13} />} {l}
              </button>
            ))}
          </div>
          <div className="studio-controls">
            {tab === "design" && (
              <>
                <span className="control-section">01 / IL TUO PRODOTTO</span>
                <Field label="Nome del design">
                  <input
                    value={design.name}
                    maxLength={80}
                    onChange={e => update({ name: e.target.value })}
                  />
                </Field>
                <Field label="Categoria">
                  <select
                    value={design.category}
                    onChange={e =>
                      update({ category: e.target.value as Design["category"] })
                    }
                  >
                    {Object.entries(categoryNames).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <span className="control-section">02 / IL TUO STILE</span>
                <div className="pattern-options">
                  {(["solid", "diagonal", "stripes", "wave"] as const).map(
                    (p, i) => (
                      <button
                        className={
                          design.pattern === p && !design.artworkId
                            ? "selected"
                            : ""
                        }
                        key={p}
                        onClick={() => update({ pattern: p, artworkId: null })}
                      >
                        <div
                          className={`pattern-swatch ${p}`}
                          style={
                            {
                              "--p": design.primary,
                              "--s": design.secondary,
                            } as React.CSSProperties
                          }
                        />
                        <span>
                          {["Essenziale", "Diagonale", "Strisce", "Onda"][i]}
                        </span>
                      </button>
                    )
                  )}
                </div>
                <span className="control-section">03 / LA TUA PALETTE</span>
                {[
                  ["primary", "Colore principale"],
                  ["secondary", "Colore secondario"],
                  ["accent", "Dettagli"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <div className="color-input">
                      <input
                        aria-label={label}
                        type="color"
                        value={design[key as "primary"]}
                        onChange={e => update({ [key]: e.target.value })}
                      />
                      <span>{design[key as "primary"].toUpperCase()}</span>
                    </div>
                  </Field>
                ))}
                <div className="palette-presets">
                  {[
                    ["#12392e", "#d5ec7b", "#f6f4ea"],
                    ["#163f69", "#e9b84c", "#ffffff"],
                    ["#842f35", "#f1d3b4", "#ffffff"],
                    ["#302950", "#c2b6e3", "#ffffff"],
                  ].map((c, i) => (
                    <button
                      key={i}
                      aria-label={`Applica palette ${i + 1}`}
                      onClick={() =>
                        update({
                          primary: c[0],
                          secondary: c[1],
                          accent: c[2],
                          artworkId: null,
                        })
                      }
                    >
                      {c.map(v => (
                        <span key={v} style={{ background: v }} />
                      ))}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "text" && (
              <>
                <span className="control-section">PERSONALIZZAZIONE</span>
                <Field label="Squadra / azienda">
                  <input
                    value={design.team}
                    maxLength={32}
                    onChange={e => update({ team: e.target.value })}
                  />
                </Field>
                <Field label="Nome sul retro">
                  <input
                    value={design.player}
                    maxLength={24}
                    onChange={e => update({ player: e.target.value })}
                  />
                </Field>
                <Field label="Numero sul retro">
                  <input
                    inputMode="numeric"
                    value={design.number}
                    maxLength={3}
                    onChange={e =>
                      update({ number: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </Field>
                <Field label="Colore dei testi">
                  <div className="color-input">
                    <input
                      aria-label="Colore dei testi"
                      type="color"
                      value={design.textColor}
                      onChange={e => update({ textColor: e.target.value })}
                    />
                    <span>{design.textColor.toUpperCase()}</span>
                  </div>
                </Field>
                <div className="info-note">
                  Nome e numero si applicano a tutti i capi di questo ordine.
                  Per una personalizzazione diversa crea un design dedicato.
                </div>
              </>
            )}
            {tab === "ai" && (
              <>
                <span className="control-section">
                  <Sparkles size={14} /> IL TUO PARTNER CREATIVO
                </span>
                <h3>Descrivi. Genera. Indossa.</h3>
                <p className="subtle">
                  Crea una grafica originale da applicare alla divisa.
                </p>
                <Field label="La tua idea">
                  <textarea
                    rows={6}
                    value={design.prompt}
                    maxLength={1500}
                    onChange={e => update({ prompt: e.target.value })}
                    placeholder="Onde geometriche verde bosco e lime, ispirate al movimento. Stile essenziale e atletico…"
                  />
                </Field>
                <button
                  className="btn primary full"
                  disabled={
                    aiBusy ||
                    !session.aiEnabled ||
                    design.prompt.trim().length < 10
                  }
                  onClick={async () => {
                    setAiBusy(true);
                    try {
                      const r = await api<{ id: string; data: string }>(
                        "/artwork/generate",
                        "POST",
                        { prompt: design.prompt, category: design.category }
                      );
                      update({ artworkId: r.id });
                      setImageData(r.data);
                      toast.success("Grafica generata.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setAiBusy(false);
                    }
                  }}
                >
                  {aiBusy ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}{" "}
                  {aiBusy ? "Generazione in corso…" : "Genera grafica"}
                </button>
                <p className="info-note">
                  {session.aiEnabled
                    ? "Ogni generazione usa il servizio OpenAI configurato dal gestore. L’immagine da 1024 px è un concept: prima della produzione il sistema verifica i DPI effettivi."
                    : "AI non configurata in questo workspace. Il gestore può abilitarla impostando OPENAI_API_KEY sul server. I pattern vettoriali sono già disponibili."}
                </p>
                <span className="control-section">HAI GIÀ UNA GRAFICA?</span>
                <label className="upload-area compact">
                  <Upload size={22} />
                  <strong>Carica PNG o JPEG</strong>
                  <small>
                    Fino a 20 MB · conserva l’originale ad alta risoluzione
                  </small>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    disabled={aiBusy}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 20 * 1024 * 1024) {
                        toast.error("Il file supera 20 MB.");
                        return;
                      }
                      setAiBusy(true);
                      try {
                        const data = await new Promise<string>(
                          (resolve, reject) => {
                            const r = new FileReader();
                            r.onload = () => resolve(r.result as string);
                            r.onerror = reject;
                            r.readAsDataURL(file);
                          }
                        );
                        const result = await api<{ id: string; data: string }>(
                          "/artwork/upload",
                          "POST",
                          { data }
                        );
                        update({ artworkId: result.id });
                        setImageData(result.data);
                        toast.success("Grafica caricata.");
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setAiBusy(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {design.artworkId && (
                  <button
                    className="btn secondary full"
                    onClick={() => update({ artworkId: null })}
                  >
                    Rimuovi immagine e usa il pattern
                  </button>
                )}
              </>
            )}
          </div>
          <div className="studio-panel-foot">
            <Check size={14} />
            Il tuo design, sotto il tuo controllo.
          </div>
        </aside>
        <section className="preview-panel">
          <div className="preview-toolbar">
            <span>
              <span className="live-dot" /> ANTEPRIMA LIVE
            </span>
            <div className="segmented small">
              {[
                ["3d", "3D"],
                ["front", "Fronte"],
                ["back", "Retro"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={view === v ? "selected" : ""}
                  onClick={() => setView(v as any)}
                >
                  {v === "3d" && <Box size={14} />} {l}
                </button>
              ))}
            </div>
          </div>
          <div className="preview-stage">
            {view === "3d" ? (
              <Suspense
                fallback={
                  <div className="subtle">Caricamento anteprima 3D…</div>
                }
              >
                <Jersey3D design={design} imageData={imageData} />
              </Suspense>
            ) : (
              <FlatJersey
                className="large-flat"
                design={design}
                imageData={imageData}
                back={view === "back"}
              />
            )}
            <div className="preview-corner">
              <span>
                JERSEY / {categoryNames[design.category].toUpperCase()}
              </span>
              <strong>{design.name || "Nuova divisa"}</strong>
            </div>
            <div className="preview-palette">
              {[design.primary, design.secondary, design.accent].map((c, i) => (
                <span key={i} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="preview-caption">
            <span>
              <Layers size={15} />
              Modello illustrativo · {categoryNames[design.category]}
            </span>
            <button
              className="text-link"
              onClick={() =>
                download(
                  artworkSvg(design, view === "back", imageData),
                  `${design.name}-concept.svg`,
                  "image/svg+xml"
                )
              }
            >
              <Download size={15} />
              Esporta concept
            </button>
          </div>
          <div className="studio-disclaimer">
            L’anteprima mostra grafica e colori su un modello generico.
            Vestibilità, cuciture e pannelli finali dipendono dal cartamodello
            del fabbricante.
          </div>
        </section>
      </div>
      {orderOpen && (
        <OrderDialog
          session={session}
          design={design}
          busy={busy}
          onClose={() => setOrderOpen(false)}
          onSubmit={async form => {
            const d = dirty || !saved ? await save() : saved;
            const order = await api(
              "/orders",
              "POST",
              { ...form, designId: d.id },
              { "Idempotency-Key": form.requestKey }
            );
            refresh();
            toast.success("Richiesta inviata al fabbricante.");
            setOrderOpen(false);
            navigate("/orders");
          }}
        />
      )}
    </>
  );
}
function OrderDialog({
  session,
  design,
  busy,
  onClose,
  onSubmit,
}: {
  session: Session;
  design: Design;
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [quantities, setQuantities] = useState(
      Object.fromEntries(
        SIZES.map(s => [s, s === "M" ? session.workspace.minimum : 0])
      )
    ),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    key = useRef(crypto.randomUUID()),
    dialog = useRef<HTMLDialogElement>(null);
  const quantity = Object.values(quantities).reduce((a, b) => a + b, 0);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal order-modal"
      onCancel={e => {
        if (sending) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">DAL DESIGN ALL’ORDINE</span>
          <h2>Facciamolo diventare reale.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Chiudi"
          disabled={sending}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        onSubmit={async e => {
          e.preventDefault();
          setSending(true);
          setError("");
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await onSubmit({
              ...f,
              quantities,
              confirmed: true,
              requestKey: key.current,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSending(false);
          }
        }}
      >
        <div className="order-summary">
          <ShirtIcon />
          <div>
            <strong>{design.name}</strong>
            <small>
              {session.workspace.name} · {categoryNames[design.category]}
            </small>
          </div>
        </div>
        <span className="control-section">TAGLIE E QUANTITÀ</span>
        <div className="size-grid">
          {SIZES.map(s => (
            <Field key={s} label={s}>
              <input
                aria-label={`Quantità ${s}`}
                type="number"
                min={0}
                max={10000}
                value={quantities[s]}
                onChange={e =>
                  setQuantities(q => ({
                    ...q,
                    [s]: Math.max(0, Math.floor(Number(e.target.value))),
                  }))
                }
              />
            </Field>
          ))}
        </div>
        <p className="subtle">
          Minimo {session.workspace.minimum} capi · Prezzo indicativo{" "}
          {money(session.workspace.unitPrice)} / capo
        </p>
        <div className="form-grid">
          <Field label="Nome / azienda">
            <input
              name="customer"
              required
              minLength={2}
              maxLength={100}
              defaultValue={session.user.name}
            />
          </Field>
          <Field label="Email di contatto">
            <input
              name="email"
              type="email"
              required
              defaultValue={session.user.email}
            />
          </Field>
        </div>
        <Field label="Indirizzo di consegna">
          <textarea
            rows={2}
            name="address"
            required
            minLength={10}
            maxLength={500}
            placeholder="Via, numero civico, CAP, città e paese"
          />
        </Field>
        <Field label="Note per il fabbricante">
          <textarea
            rows={2}
            name="notes"
            maxLength={1000}
            placeholder="Scadenza desiderata, tessuto, indicazioni particolari…"
          />
        </Field>
        <div className="order-total">
          <span>{quantity} capi · Valore indicativo</span>
          <strong>{money(quantity * session.workspace.unitPrice)}</strong>
        </div>
        <p className="info-note">
          La richiesta sarà verificata dal fabbricante. IVA, spedizione, tempi e
          prezzo finale sono da confermare. Non viene effettuato alcun
          pagamento.
        </p>
        <label className="checkbox-label">
          <input type="checkbox" required />
          Ho verificato design, personalizzazioni e quantità.
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button
          className="btn primary full"
          disabled={sending || busy || quantity < session.workspace.minimum}
        >
          {sending ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <>
              Invia richiesta <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
    </dialog>
  );
}
function ShirtIcon() {
  return (
    <span className="summary-icon">
      <ShoppingBag size={22} />
    </span>
  );
}
