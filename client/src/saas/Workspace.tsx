import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Download,
  Scissors,
  Check,
  ArrowUpRight,
  Copy,
  Save,
  Loader2,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import {
  patternSchema,
  type SavedPattern,
  type Pattern,
  type Session,
} from "@shared/production";
import { api, download, date } from "./api";
import { Field, Empty, Badge, categoryNames } from "../App";

// This is a format example, deliberately unapproved. It is never auto-imported.
export const patternExample = {
  name: "ESEMPIO FORMATO — sostituire con geometrie reali",
  category: "football",
  revision: "sample-1",
  fabric: "Sostituire con il tessuto effettivo",
  bleedMm: 10,
  minDpi: 150,
  approved: false,
  sizes: [
    {
      size: "M",
      pieces: [
        {
          key: "front",
          widthMm: 550,
          heightMm: 720,
          cutPath: "M0 0H550V720H0Z",
        },
        {
          key: "back",
          widthMm: 550,
          heightMm: 720,
          cutPath: "M0 0H550V720H0Z",
        },
        {
          key: "left-sleeve",
          widthMm: 350,
          heightMm: 300,
          cutPath: "M0 0H350V300H0Z",
        },
        {
          key: "right-sleeve",
          widthMm: 350,
          heightMm: 300,
          cutPath: "M0 0H350V300H0Z",
        },
      ],
    },
  ],
};
export function Patterns() {
  const [patterns, setPatterns] = useState<SavedPattern[]>([]),
    [candidate, setCandidate] = useState<Pattern | null>(null),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      setPatterns(await api<SavedPattern[]>("/patterns"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LA BASE DI OGNI CAPO</span>
          <h1>Cartamodelli</h1>
          <p>
            Geometrie approvate, taglia per taglia. Un passaggio preciso alla
            produzione.
          </p>
        </div>
        <button
          className="btn secondary"
          onClick={() =>
            download(
              JSON.stringify(patternExample, null, 2),
              "pattern-format-example.json"
            )
          }
        >
          <Download size={16} />
          Esempio di formato
        </button>
      </div>
      <div className="pattern-intro">
        <span className="workflow-icon">
          <Scissors size={25} />
        </span>
        <div>
          <h3>Il cartamodello appartiene al fabbricante.</h3>
          <p>
            Importa i contorni dei pannelli dal tuo CAD come tracciati SVG in
            millimetri, raccolti nel formato JSON. Ogni taglia richiede fronte,
            retro e due maniche. Mantieni la stessa orientazione della grafica.
            Le geometrie caricate non vengono scalate automaticamente.
          </p>
        </div>
      </div>
      <label className="upload-area">
        <Upload size={28} />
        <h3>Carica il tuo cartamodello</h3>
        <p>Seleziona un file JSON · Massimo 1 MB</p>
        <span className="btn primary">
          Scegli file <ArrowUpRight size={15} />
        </span>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError("");
            setCandidate(null);
            setApproved(false);
            try {
              if (f.size > 1024 * 1024) throw new Error("Il file supera 1 MB.");
              const json = JSON.parse(await f.text());
              if (String(json.name).startsWith("ESEMPIO"))
                throw new Error(
                  "L’esempio spiega il formato: sostituisci nome, tessuto, misure e geometrie con il tuo cartamodello reale."
                );
              setCandidate(patternSchema.parse({ ...json, approved: true }));
            } catch (e) {
              setError((e as Error).message);
            }
            e.target.value = "";
          }}
        />
      </label>
      {candidate && (
        <section className="candidate-pattern">
          <div className="section-heading">
            <div>
              <span className="eyebrow">VERIFICA PRIMA DI IMPORTARE</span>
              <h2>{candidate.name}</h2>
              <p>
                {categoryNames[candidate.category]} · {candidate.fabric} ·
                revisione {candidate.revision}
              </p>
            </div>
            <Badge>{candidate.sizes.length} taglie</Badge>
          </div>
          <div className="pattern-previews">
            {candidate.sizes.map(s => (
              <div key={s.size}>
                <strong>Taglia {s.size}</strong>
                <div>
                  {s.pieces.map(p => (
                    <figure key={p.key}>
                      <svg
                        viewBox={`-20 -20 ${p.widthMm + 40} ${p.heightMm + 40}`}
                        role="img"
                        aria-label={`${s.size} ${p.key}`}
                      >
                        <path
                          d={p.cutPath}
                          fill="#e1eadb"
                          stroke="#12392e"
                          strokeWidth="2"
                        />
                      </svg>
                      <figcaption>
                        {p.key}
                        <br />
                        {p.widthMm} × {p.heightMm} mm
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="info-note">
            Abbondanza di stampa: {candidate.bleedMm} mm · Risoluzione minima
            immagini: {candidate.minDpi} DPI. I tracciati definiscono la linea
            di taglio; includi i margini di cucitura richiesti dal tuo processo.
            Non vengono aggiunti margini di cucitura o compensazioni di ritiro.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={approved}
              onChange={e => setApproved(e.target.checked)}
            />
            Confermo che geometrie, misure, margini di cucitura, orientamento
            della grafica e tessuto sono stati verificati e approvati per la
            produzione.
          </label>
          <div className="button-row">
            <button
              className="btn primary"
              disabled={!approved || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/patterns", "POST", candidate);
                  setCandidate(null);
                  setApproved(false);
                  await load();
                  toast.success("Cartamodello importato e approvato.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Importa cartamodello approvato
            </button>
            <button
              className="btn secondary"
              onClick={() => setCandidate(null)}
            >
              Annulla
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="section-heading">
        <div>
          <h2>Libreria del fabbricante</h2>
          <p>Ogni importazione crea una revisione indipendente.</p>
        </div>
        <Badge>{patterns.length} cartamodelli</Badge>
      </div>
      {patterns.length ? (
        <div className="pattern-library">
          {patterns.map(p => (
            <article key={p.id}>
              <div className="pattern-card-top">
                <span className="workflow-icon">
                  <FileJson size={23} />
                </span>
                <Badge green>Approvato</Badge>
              </div>
              <h3>{p.name}</h3>
              <p>
                {categoryNames[p.category]} · {p.fabric}
              </p>
              <div className="size-tags">
                {p.sizes.map(s => (
                  <span key={s.size}>{s.size}</span>
                ))}
              </div>
              <small>
                Rev. {p.revision} · {date(p.createdAt)}
                <br />
                Abbondanza {p.bleedMm} mm · {p.minDpi} DPI
              </small>
              <button
                className="text-link"
                onClick={() =>
                  download(JSON.stringify(p, null, 2), `pattern-${p.id}.json`)
                }
              >
                <Download size={15} />
                Scarica geometrie
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Le tue geometrie, qui"
          description="Importa il primo cartamodello per poter approvare gli ordini e generare i pannelli di stampa."
        />
      )}
    </>
  );
}
export function WorkspaceSettings({
  session,
  onUpdate,
}: {
  session: Session;
  onUpdate: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    url = `${window.location.origin}/store/${session.workspace.slug}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">IL TUO SPAZIO, LE TUE REGOLE</span>
          <h1>Impostazioni</h1>
          <p>Configura il fabbricante e invita i clienti a creare.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Il tuo fabbricante</h2>
          <p className="subtle">
            Listino indicativo condiviso con i clienti. Non include IVA e
            spedizione.
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              const f = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api("/workspace", "PATCH", {
                  name: f.name,
                  unitPrice: Math.round(Number(f.price) * 100),
                  minimum: Number(f.minimum),
                });
                await onUpdate();
                toast.success("Impostazioni salvate.");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome del fabbricante">
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={session.workspace.name}
              />
            </Field>
            <div className="form-grid">
              <Field label="Prezzo indicativo / capo (€)">
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="1"
                  max="10000"
                  required
                  defaultValue={session.workspace.unitPrice / 100}
                />
              </Field>
              <Field label="Minimo d’ordine (capi)">
                <input
                  name="minimum"
                  type="number"
                  min="1"
                  max="10000"
                  required
                  defaultValue={session.workspace.minimum}
                />
              </Field>
            </div>
            <button className="btn primary" disabled={busy}>
              <Save size={16} />
              Salva impostazioni
            </button>
          </form>
        </section>
        <section className="settings-card">
          <span className="workflow-icon">
            <ArrowUpRight size={23} />
          </span>
          <h2>Il tuo configuratore clienti</h2>
          <p className="subtle">
            Condividi questo link: i clienti si registrano nel tuo workspace,
            creano un design e ti inviano una richiesta.
          </p>
          <div className="share-url">{url}</div>
          <button
            className="btn secondary"
            disabled={session.workspace.demo}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiato.");
              } catch {
                toast.error("Seleziona e copia il link visualizzato.");
              }
            }}
          >
            <Copy size={16} />
            Copia link clienti
          </button>
          {session.workspace.demo && (
            <p className="info-note">
              Il link clienti è disponibile nei workspace reali.
            </p>
          )}
          <hr />
          <h3>
            <SparkleIcon /> Generazione AI
          </h3>
          <Badge green={session.aiEnabled}>
            {session.aiEnabled ? "Servizio disponibile" : "Da configurare"}
          </Badge>
          <p className="subtle">
            {session.aiEnabled
              ? "Le nuove grafiche vengono generate con il servizio OpenAI."
              : "Il gestore del server può configurare OPENAI_API_KEY per abilitare la generazione. La chiave resta sul server."}
          </p>
          <p className="info-note">
            Per ora tutte le categorie usano il prezzo per capo impostato qui.
            Le richieste sono gestite dal fabbricante; pagamenti e abbonamenti
            SaaS non sono ancora collegati.
          </p>
        </section>
      </div>
    </>
  );
}
function SparkleIcon() {
  return <span>✧</span>;
}
