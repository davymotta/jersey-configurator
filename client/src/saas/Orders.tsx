import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Download,
  Package,
  Check,
  Loader2,
  X,
  Clock,
  Scissors,
  Truck,
  Factory,
} from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_LABELS,
  transitions,
  type Order,
  type SavedPattern,
  type Session,
  type Status,
} from "@shared/production";
import { api, money, date } from "./api";
import { Badge, Empty, Field, categoryNames } from "../App";
import { FlatJersey } from "./Preview";

export default function Orders({
  session,
  orders,
  refresh,
}: {
  session: Session;
  orders: Order[];
  refresh: () => void;
}) {
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string>(),
    [patterns, setPatterns] = useState<SavedPattern[]>([]),
    [patternId, setPatternId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (session.user.role !== "owner") return;
    api<SavedPattern[]>("/patterns")
      .then(setPatterns)
      .catch(e => toast.error(e.message));
  }, []);
  const order = orders.find(o => o.id === selected),
    visible = orders.filter(o => filter === "all" || o.status === filter),
    owner = session.user.role === "owner";
  async function advance(status: Status) {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      await api(`/orders/${order.id}`, "PATCH", {
        status,
        ...(status === "approved" ? { patternId } : {}),
      });
      refresh();
      toast.success("Ordine aggiornato.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pack() {
    if (!order) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/orders/${order.id}/pack`, {
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `${order.reference}-production.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OGNI DETTAGLIO, FINO ALLA CONSEGNA</span>
          <h1>{owner ? "Ordini" : "I miei ordini"}</h1>
          <p>
            {owner
              ? "Dalla richiesta del cliente alla coda di produzione."
              : "Segui il percorso delle tue divise."}
          </p>
        </div>
        <span className="badge green">
          <Package size={13} />
          {orders.length} richieste
        </span>
      </div>
      <div className="filter-bar">
        <div className="filter-tabs">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Tutti
          </button>
          {Object.entries(STATUS_LABELS).map(([s, label]) => (
            <button
              key={s}
              className={filter === s ? "selected" : ""}
              onClick={() => setFilter(s)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine / Cliente</th>
                <th>Design</th>
                <th>Capi</th>
                <th>Valore indicativo</th>
                <th>Stato</th>
                <th>Data</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(o => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.reference}</strong>
                    <small>{o.customer}</small>
                  </td>
                  <td>
                    {o.design.name}
                    <small>{categoryNames[o.design.category]}</small>
                  </td>
                  <td>{o.quantity}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    <Badge green={o.status === "shipped"}>
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </td>
                  <td>{date(o.createdAt)}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Apri ${o.reference}`}
                      onClick={() => {
                        setSelected(o.id);
                        setError("");
                        setPatternId("");
                      }}
                    >
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Il prossimo ordine inizia da un design"
          description="Le richieste con taglie, quantità e grafica confermata appariranno qui."
        >
          <Link className="btn primary" href="/studio">
            Apri il design studio <ArrowRight size={16} />
          </Link>
        </Empty>
      )}
      {order && (
        <div className="order-detail">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{order.reference}</span>
              <h2>{order.design.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Chiudi dettaglio ordine"
              onClick={() => setSelected(undefined)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="order-detail-grid">
            <div className="order-render">
              <FlatJersey design={order.design} />
              <FlatJersey design={order.design} back />
            </div>
            <div>
              <div className="detail-top">
                <Badge green={order.status === "shipped"}>
                  {STATUS_LABELS[order.status]}
                </Badge>
                <span className="subtle">
                  Design v{order.design.revision} · Copia confermata
                </span>
              </div>
              <h3>{order.customer}</h3>
              <p className="subtle">
                {order.email}
                <br />
                <span className="preserve-lines">{order.address}</span>
              </p>
              <div className="ordered-sizes">
                {Object.entries(order.quantities)
                  .filter(([, q]) => q > 0)
                  .map(([s, q]) => (
                    <div key={s}>
                      <span>{s}</span>
                      <strong>{q}</strong>
                    </div>
                  ))}
              </div>
              <div className="order-total">
                <span>{order.quantity} capi</span>
                <strong>{money(order.total)}</strong>
              </div>
              {order.notes && (
                <p className="info-note preserve-lines">{order.notes}</p>
              )}
              <div className="order-history">
                {order.history.map((h, i) => (
                  <div key={i}>
                    <span>
                      <Check size={12} />
                    </span>
                    <strong>{STATUS_LABELS[h.status]}</strong>
                    <small>{date(h.at)}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {owner && (
            <div className="production-actions">
              <div>
                <span className="control-section">
                  <Scissors size={15} /> PASSAGGIO IN PRODUZIONE
                </span>
                {order.pattern ? (
                  <p>
                    <strong>{order.pattern.name}</strong> · revisione{" "}
                    {order.pattern.revision}
                    <br />
                    <small className="subtle">
                      Cartamodello e geometrie congelati all’approvazione.
                    </small>
                  </p>
                ) : order.status === "submitted" ? (
                  <Field label="Cartamodello approvato">
                    <select
                      value={patternId}
                      onChange={e => setPatternId(e.target.value)}
                    >
                      <option value="">Seleziona un cartamodello</option>
                      {patterns
                        .filter(p => p.category === order.design.category)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} · rev. {p.revision} ·{" "}
                            {p.sizes.map(s => s.size).join(", ")}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <p className="subtle">Nessun cartamodello assegnato.</p>
                )}
                {!patterns.some(p => p.category === order.design.category) &&
                  order.status === "submitted" && (
                    <Link className="text-link" href="/patterns">
                      Carica un cartamodello <ArrowRight size={15} />
                    </Link>
                  )}
              </div>
              <div className="button-row">
                {transitions[order.status].map(s => (
                  <button
                    key={s}
                    disabled={busy || (s === "approved" && !patternId)}
                    className={`btn ${s === "cancelled" ? "secondary danger" : "primary"}`}
                    onClick={() => advance(s)}
                  >
                    {busy ? (
                      <Loader2 size={15} className="spin" />
                    ) : s === "production" ? (
                      <Factory size={15} />
                    ) : s === "shipped" ? (
                      <Truck size={15} />
                    ) : s === "approved" ? (
                      <Check size={15} />
                    ) : (
                      <X size={15} />
                    )}
                    {
                      {
                        approved: "Approva ordine",
                        production: "Avvia produzione",
                        shipped: "Segna spedito",
                        cancelled: "Annulla ordine",
                        submitted: "Invia",
                      }[s]
                    }
                  </button>
                ))}
                {order.pattern && order.status !== "cancelled" && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={pack}
                  >
                    <Download size={16} />
                    Pacchetto produzione
                  </button>
                )}
              </div>
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="info-note">
            La richiesta non include un pagamento. Il pacchetto contiene
            pannelli SVG in millimetri, abbondanze, tabella quantità e scheda
            ordine. Il fabbricante verifica colore, misure, font e impostazioni
            RIP prima di stampare.
          </div>
        </div>
      )}
    </>
  );
}
