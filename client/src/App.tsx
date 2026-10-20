import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  ArrowRight,
  Shirt,
  LayoutDashboard,
  Palette,
  ShoppingBag,
  Scissors,
  Settings,
  Plus,
  LogOut,
  Menu,
  X,
  Check,
  Layers,
  Box,
  Factory,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api, money, date } from "./saas/api";
import { FlatJersey } from "./saas/Preview";
import Studio from "./saas/Studio";
import Orders from "./saas/Orders";
import { Patterns, WorkspaceSettings } from "./saas/Workspace";
import {
  DEFAULT_DESIGN,
  STATUS_LABELS,
  type Session,
  type SavedDesign,
  type Order,
} from "@shared/production";

export const categoryNames = {
  football: "Calcio",
  cricket: "Cricket",
  corporate: "Corporate",
};
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Layers size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Badge({
  children,
  green = false,
}: {
  children: ReactNode;
  green?: boolean;
}) {
  return <span className={`badge ${green ? "green" : ""}`}>{children}</span>;
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [path, navigate] = useLocation(),
    [mobile, setMobile] = useState(false),
    [tick, setTick] = useState(0);
  const [designs, setDesigns] = useState<SavedDesign[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [dataError, setDataError] = useState("");
  async function refreshSession() {
    const s = await api<Session | null>("/session");
    setSession(s);
    return s;
  }
  useEffect(() => {
    refreshSession()
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    let current = true;
    Promise.all([api<SavedDesign[]>("/designs"), api<Order[]>("/orders")])
      .then(([d, o]) => {
        if (current) {
          setDesigns(d);
          setOrders(o);
          setDataError("");
        }
      })
      .catch(e => {
        if (current) setDataError(e.message);
      });
    return () => {
      current = false;
    };
  }, [session, tick]);
  const refresh = () => setTick(t => t + 1);
  if (loading)
    return (
      <div className="loading-screen">
        <Shirt />
        <span>Jersey</span>
        <Loader2 className="spin" size={18} />
      </div>
    );
  if (!session)
    return (
      <>
        <Toaster richColors position="bottom-right" />
        <Welcome
          path={path}
          onSuccess={async () => {
            await refreshSession();
            navigate("/");
          }}
        />
      </>
    );
  const nav = [
    { href: "/", label: "Panoramica", icon: LayoutDashboard },
    { href: "/studio", label: "Design studio", icon: Palette },
    { href: "/designs", label: "I miei design", icon: Shirt },
    {
      href: "/orders",
      label: session.user.role === "owner" ? "Ordini" : "I miei ordini",
      icon: ShoppingBag,
    },
    ...(session.user.role === "owner"
      ? [
          { href: "/patterns", label: "Cartamodelli", icon: Scissors },
          { href: "/settings", label: "Impostazioni", icon: Settings },
        ]
      : []),
  ];
  const titles: Record<string, string> = {
    "/": "Panoramica",
    "/studio": "Design studio",
    "/designs": "I miei design",
    "/orders": "Ordini",
    "/patterns": "Cartamodelli",
    "/settings": "Impostazioni",
  };
  const active = path.startsWith("/studio") ? "/studio" : path;
  const title = titles[active] || "Pagina non trovata";
  return (
    <div className="app-shell">
      <Toaster richColors position="bottom-right" />
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Chiudi menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Shirt size={22} />
          </span>
          jersey<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-switch">
          <div className="workspace-monogram">
            {session.workspace.name.slice(0, 1)}
          </div>
          <div>
            <strong>{session.workspace.name}</strong>
            <small>
              {session.workspace.demo
                ? "Workspace dimostrativo"
                : "Workspace del fabbricante"}
            </small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={active === href ? "active" : ""}
              onClick={() => setMobile(false)}
            >
              <Icon size={19} />
              {label}
              {href === "/orders" &&
                orders.filter(o => o.status === "submitted").length > 0 && (
                  <span aria-hidden="true" className="nav-count">
                    {orders.filter(o => o.status === "submitted").length}
                  </span>
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Box size={21} />
            <strong>Dal concept al capo.</strong>
            <p>
              Design, ordini e produzione.
              <br />
              Tutto nello stesso spazio.
            </p>
          </div>
          <div className="user-card">
            <span className="avatar">
              {session.user.name
                .split(" ")
                .map(s => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {session.user.role === "owner" ? "Fabbricante" : "Cliente"}
              </small>
            </div>
            <button
              className="icon-button"
              title="Esci"
              aria-label="Esci"
              onClick={async () => {
                try {
                  await api("/logout", "POST", {});
                  setSession(null);
                  setDesigns([]);
                  setOrders([]);
                  navigate("/");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Apri menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" />
            {session.workspace.demo ? "Modalità demo" : "Workspace attivo"}
            <span className="top-avatar">{session.user.name[0]}</span>
          </div>
        </header>
        {session.workspace.demo && (
          <div className="demo-banner">
            Stai esplorando una demo privata: i dati sono di esempio e l’AI è
            disabilitata.{" "}
            <button
              onClick={async () => {
                await api("/logout", "POST", {});
                setSession(null);
                navigate("/");
              }}
            >
              Crea il tuo workspace <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        <main
          className={`content ${active === "/studio" ? "studio-content" : ""}`}
        >
          {dataError ? (
            <div className="error-banner">
              {dataError}
              <button onClick={refresh}>Riprova</button>
            </div>
          ) : null}
          {path === "/" ? (
            <Dashboard session={session} designs={designs} orders={orders} />
          ) : path === "/designs" ? (
            <Designs designs={designs} />
          ) : path.startsWith("/studio") ? (
            <Studio
              key={path}
              session={session}
              designs={designs}
              refresh={refresh}
            />
          ) : path === "/orders" ? (
            <Orders session={session} orders={orders} refresh={refresh} />
          ) : path === "/patterns" && session.user.role === "owner" ? (
            <Patterns />
          ) : path === "/settings" && session.user.role === "owner" ? (
            <WorkspaceSettings session={session} onUpdate={refreshSession} />
          ) : (
            <Empty
              title="Pagina non trovata"
              description="Torna al tuo workspace per continuare."
            >
              <Link className="btn primary" href="/">
                Panoramica
              </Link>
            </Empty>
          )}
        </main>
        <footer className="app-footer">
          <span>Jersey · Design to production</span>
          <span>Il tuo prossimo capo inizia qui.</span>
        </footer>
      </div>
    </div>
  );
}
function Welcome({
  path,
  onSuccess,
}: {
  path: string;
  onSuccess: () => Promise<void>;
}) {
  const storeSlug = path.startsWith("/store/") ? path.split("/")[2] : null;
  const [mode, setMode] = useState<"register" | "login">("register"),
    [busy, setBusy] = useState(false),
    [store, setStore] = useState<{ name: string } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (storeSlug)
      api<{ name: string }>(`/stores/${encodeURIComponent(storeSlug)}`)
        .then(setStore)
        .catch(e => setError(e.message));
  }, [storeSlug]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(mode === "login" ? "/login" : "/register", "POST", {
        ...f,
        slug: storeSlug || f.slug,
        ...(mode === "register" && !storeSlug
          ? { workspace: f.workspace }
          : {}),
      });
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="welcome">
      <section className="welcome-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Shirt size={22} />
          </span>
          jersey<span className="brand-dot">.</span>
        </Link>
        <div className="welcome-copy">
          <span className="eyebrow light">DESIGN TO PRODUCTION</span>
          <h1>
            La tua idea.
            <br />
            La loro prossima
            <br />
            <em>divisa preferita.</em>
          </h1>
          <p>
            Lo spazio dove i fabbricanti di teamwear trasformano la creatività
            in ordini pronti da gestire.
          </p>
          <div className="welcome-tags">
            <span>
              <Sparkles size={15} /> Design generativo
            </span>
            <span>
              <Box size={15} /> Anteprima 3D
            </span>
            <span>
              <Factory size={15} /> Produzione
            </span>
          </div>
          <div className="welcome-shirt">
            <FlatJersey design={DEFAULT_DESIGN} />
            <div className="floating-label">
              <Check size={15} /> Un unico flusso. Dall’idea all’ordine.
            </div>
          </div>
        </div>
        <small>Calcio · Cricket · Corporate teamwear</small>
      </section>
      <section className="welcome-form">
        <div className="auth-card">
          <span className="eyebrow">IL TUO PROSSIMO PASSO</span>
          <h2>
            {storeSlug
              ? store?.name || "Configuratore clienti"
              : mode === "login"
                ? "Bentornato."
                : "Crea senza limiti."}
          </h2>
          <p>
            {storeSlug
              ? "Crea il tuo design e invia una richiesta al fabbricante."
              : mode === "login"
                ? "Accedi allo spazio del tuo fabbricante."
                : "Apri il tuo workspace e porta il teamwear a un nuovo livello."}
          </p>
          <div className="segmented">
            <button
              className={mode === "register" ? "selected" : ""}
              onClick={() => setMode("register")}
            >
              {storeSlug ? "Registrati" : "Crea workspace"}
            </button>
            <button
              className={mode === "login" ? "selected" : ""}
              onClick={() => setMode("login")}
            >
              Accedi
            </button>
          </div>
          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <Field label="Il tuo nome">
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Nome e cognome"
                  />
                </Field>
                {!storeSlug && (
                  <Field label="Nome del fabbricante">
                    <input
                      name="workspace"
                      required
                      minLength={2}
                      maxLength={80}
                      placeholder="Es. Atelier Sport"
                    />
                  </Field>
                )}
              </>
            )}
            {!storeSlug && (
              <Field label="Indirizzo workspace">
                <div className="input-prefix">
                  <span>jersey /</span>
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    minLength={3}
                    maxLength={48}
                    placeholder="atelier-sport"
                  />
                </div>
              </Field>
            )}
            <Field label="Email">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@azienda.it"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="Almeno 12 caratteri"
              />
            </Field>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn primary full"
              disabled={busy || !!(storeSlug && !store)}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <>
                  {mode === "login"
                    ? "Accedi al workspace"
                    : storeSlug
                      ? "Crea account cliente"
                      : "Crea il tuo workspace"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          {!storeSlug && (
            <>
              <div className="or-divider">
                <span>oppure dai un’occhiata</span>
              </div>
              <button
                className="btn secondary full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/demo", "POST", {});
                    await onSuccess();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Esplora la demo <ArrowUpRight size={16} />
              </button>
            </>
          )}
          <p className="auth-footnote">
            {storeSlug
              ? "I tuoi design e ordini sono visibili al fabbricante."
              : "Un workspace separato per la tua azienda e i suoi clienti."}
          </p>
        </div>
      </section>
    </div>
  );
}
function Dashboard({
  session,
  designs,
  orders,
}: {
  session: Session;
  designs: SavedDesign[];
  orders: Order[];
}) {
  const pending = orders.filter(o => o.status === "submitted").length,
    production = orders.filter(o => o.status === "production").length,
    total = orders
      .filter(o => o.status !== "cancelled")
      .reduce((a, o) => a + o.total, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">IL TUO WORKSPACE, A COLPO D’OCCHIO</span>
          <h1>
            Ciao, {session.user.name.split(" ")[0]}{" "}
            <span className="wave">
              <ArrowUpRight size={27} />
            </span>
          </h1>
          <p>Diamo forma alla prossima grande divisa.</p>
        </div>
        <Link href="/studio" className="btn primary">
          <Plus size={17} />
          Nuovo design
        </Link>
      </div>
      <section className="dashboard-hero">
        <div>
          <span className="hero-tag">
            <span /> DALL’IDEA ALLA PRODUZIONE
          </span>
          <h2>
            Il tuo design.
            <br />
            Pronto a scendere in campo.
          </h2>
          <p>
            Crea una divisa unica, esplorala in 3D e porta
            <br className="desktop" /> ogni dettaglio fino al fabbricante.
          </p>
          <Link href="/studio" className="btn lime">
            Apri il design studio <ArrowUpRight size={17} />
          </Link>
          <span className="hero-bottom">
            <span>01 / CREA</span>
            <span>02 / VISUALIZZA</span>
            <span>03 / PRODUCI</span>
          </span>
        </div>
        <div className="hero-visual">
          <div className="hero-ring ring-one" />
          <div className="hero-ring ring-two" />
          <FlatJersey design={designs[0] || DEFAULT_DESIGN} />
          <div className="hero-chip">
            <Box size={16} />
            <div>
              DAL DIGITALE AL TESSUTO
              <small>Ogni dettaglio, nello stesso flusso.</small>
            </div>
          </div>
        </div>
      </section>
      <section className="stats-grid">
        {[
          {
            label: "Design salvati",
            value: designs.length,
            sub: "La tua libreria creativa",
            icon: Palette,
          },
          {
            label: "Ordini da approvare",
            value: pending,
            sub: "In attesa del fabbricante",
            icon: ShoppingBag,
          },
          {
            label: "In produzione",
            value: production,
            sub: "Dal progetto al prodotto",
            icon: Factory,
          },
          {
            label: "Valore richieste",
            value: money(total),
            sub: "Esclusi gli ordini annullati",
            icon: Layers,
          },
        ].map(({ label, value, sub, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </article>
        ))}
      </section>
      <div className="section-heading">
        <div>
          <h2>La tua prossima creazione</h2>
          <p>Un percorso semplice, un risultato tutto tuo.</p>
        </div>
        <span className="subtle">PENSATO PER IL TEAMWEAR</span>
      </div>
      <section className="workflow-grid">
        {[
          {
            n: "01",
            icon: Sparkles,
            title: "Dai spazio alle idee",
            copy: "Palette, pattern e AI per una divisa che lascia il segno.",
            link: "/studio",
            cta: "Inizia a creare",
          },
          {
            n: "02",
            icon: Box,
            title: "Guardala da ogni lato",
            copy: "Colori e personalizzazioni su un’anteprima 3D interattiva.",
            link: "/studio",
            cta: "Esplora lo studio",
          },
          {
            n: "03",
            icon: Scissors,
            title: "Portala in produzione",
            copy: "Taglie, cartamodelli e pannelli per un passaggio di consegne preciso.",
            link: session.user.role === "owner" ? "/patterns" : "/orders",
            cta: "Gestisci il prossimo passo",
          },
        ].map(({ n, icon: Icon, title, copy, link, cta }) => (
          <Link href={link} key={n} className="workflow-card">
            <div>
              <span className="workflow-icon">
                <Icon size={21} />
              </span>
              <span>{n}</span>
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
            <span className="card-link">
              {cta}
              <ArrowRight size={16} />
            </span>
          </Link>
        ))}
      </section>
      <div className="section-heading">
        <div>
          <h2>Design recenti</h2>
          <p>Riprendi da dove nasce l’ispirazione.</p>
        </div>
        <Link href="/designs" className="text-link">
          Tutti i design <ArrowRight size={16} />
        </Link>
      </div>
      <div className="design-grid">
        {designs.slice(0, 3).map(d => (
          <DesignCard key={d.id} design={d} />
        ))}
        <Link href="/studio" className="new-design-card">
          <span>
            <Plus size={24} />
          </span>
          <strong>Un’altra idea?</strong>
          <small>Crea un nuovo design</small>
        </Link>
      </div>
      {orders.length > 0 && (
        <>
          <div className="section-heading">
            <h2>Ultimi ordini</h2>
            <Link className="text-link" href="/orders">
              Gestisci ordini <ArrowRight size={16} />
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Design</th>
                  <th>Capi</th>
                  <th>Stato</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 4).map(o => (
                  <tr key={o.id}>
                    <td>
                      <Link className="text-link" href="/orders">
                        {o.reference}
                      </Link>
                    </td>
                    <td>{o.design.name}</td>
                    <td>{o.quantity}</td>
                    <td>
                      <Badge green={o.status === "shipped"}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </td>
                    <td>{date(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
export function DesignCard({ design: d }: { design: SavedDesign }) {
  return (
    <Link href={`/studio/${d.id}`} className="design-card">
      <div className="design-thumbnail">
        <FlatJersey design={d} />
        <span className="design-category">{categoryNames[d.category]}</span>
        <span className="design-arrow">
          <ArrowUpRight size={17} />
        </span>
      </div>
      <div className="design-card-info">
        <strong>{d.name}</strong>
        <div>
          <small>Modificato il {date(d.updatedAt)}</small>
          <div className="color-dots">
            {[d.primary, d.secondary, d.accent].map((c, i) => (
              <span style={{ background: c }} key={i} />
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
function Designs({ designs }: { designs: SavedDesign[] }) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const visible = designs.filter(
    d =>
      (filter === "all" || d.category === filter) &&
      d.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LA TUA LIBRERIA CREATIVA</span>
          <h1>I miei design</h1>
          <p>Ogni idea, pronta per il prossimo passo.</p>
        </div>
        <Link className="btn primary" href="/studio">
          <Plus size={17} />
          Nuovo design
        </Link>
      </div>
      <div className="filter-bar">
        <div className="filter-tabs">
          {[["all", "Tutti"], ...Object.entries(categoryNames)].map(
            ([v, l]) => (
              <button
                key={v}
                className={filter === v ? "selected" : ""}
                onClick={() => setFilter(v)}
              >
                {l}
              </button>
            )
          )}
        </div>
        <input
          aria-label="Cerca design"
          placeholder="Cerca un design…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {visible.length ? (
        <div className="design-grid library">
          {visible.map(d => (
            <DesignCard key={d.id} design={d} />
          ))}
        </div>
      ) : (
        <Empty
          title="Uno spazio per le tue idee"
          description="Crea un design o modifica i filtri di ricerca."
        >
          <Link className="btn primary" href="/studio">
            Crea un design <Plus size={16} />
          </Link>
        </Empty>
      )}
    </>
  );
}
