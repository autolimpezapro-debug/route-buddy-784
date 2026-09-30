import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Search, MapPin, Truck, X, Navigation, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { STATUS_LABEL, type Pedido, type Status } from "@/lib/pc-parser";
import { usePedidos, ordenarRota, DEPOSITO } from "@/lib/store";
import { importarArquivos } from "@/lib/importer";
import { geocodeEndereco } from "@/lib/geo.functions";

const RouteMap = lazy(() => import("@/components/RouteMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Roteirizador de Coletas — Pedidos de Compra" },
      { name: "description", content: "Importe conversas do WhatsApp com PCs, veja fornecedores no mapa e monte a rota de coleta." },
      { property: "og:title", content: "Roteirizador de Coletas — Pedidos de Compra" },
      { property: "og:description", content: "Importe PCs do WhatsApp, visualize no mapa e gere a rota de coleta." },
    ],
  }),
  component: Index,
});

const STATUSES = Object.keys(STATUS_LABEL) as Status[];
const DOT: Record<Status, string> = {
  aguardando: "bg-status-aguardando",
  rota: "bg-status-rota",
  estoque: "bg-status-estoque",
  fabricacao: "bg-status-fabricacao",
  coletado: "bg-status-coletado",
};

function Index() {
  const { pedidos, ready, update, adicionar, remover, limpar } = usePedidos();
  const geocode = useServerFn(geocodeEndereco);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("todos");
  const [sel, setSel] = useState<string | null>(null);
  const [importando, setImportando] = useState<string | null>(null);
  const [geoFila, setGeoFila] = useState(0);
  const [rotaGeo, setRotaGeo] = useState<[number, number][] | null>(null);
  const [rotaInfo, setRotaInfo] = useState<{ km: number; min: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const geoRunning = useRef(false);
  const [geoTick, setGeoTick] = useState(0);

  // Background geocoding of orders without coordinates
  useEffect(() => {
    if (!ready || geoRunning.current) return;
    const pend = pedidos.filter((p) => p.lat == null && !p.geoFalhou).sort((a, b) => Number(b.status === "rota") - Number(a.status === "rota"));
    setGeoFila(pend.length);
    if (!pend.length) return;
    geoRunning.current = true;
    (async () => {
      const p = pend[0]!;
      try {
        const r = await geocode({ data: { endereco: p.endereco, bairro: p.bairro, cidade: p.cidade, uf: p.uf, cep: p.cep } });
        if (r) update(p.id, { lat: r.lat, lng: r.lng, cidade: p.cidade || r.cidade });
        else update(p.id, { geoFalhou: true });
      } catch {
        update(p.id, { geoFalhou: true });
      }
      await new Promise((res) => setTimeout(res, 1100));
      geoRunning.current = false;
      setGeoTick((t) => t + 1);
    })();
  }, [pedidos, ready, geocode, update, geoTick]);

  const rota = useMemo(() => ordenarRota(pedidos.filter((p) => p.status === "rota")), [pedidos]);
  const semLocal = pedidos.filter((p) => p.status === "rota" && p.lat == null).length;

  // Road geometry via OSRM
  const rotaKey = rota.map((p) => p.id).join(",");
  useEffect(() => {
    setRotaGeo(null);
    setRotaInfo(null);
    if (!rota.length) return;
    const pts = [DEPOSITO, ...rota.map((p) => ({ lat: p.lat!, lng: p.lng! })), DEPOSITO];
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const ctl = new AbortController();
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        const r = j.routes?.[0];
        if (!r) return;
        setRotaGeo(r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]));
        setRotaInfo({ km: r.distance / 1000, min: r.duration / 60 });
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [rotaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos
      .filter((p) => filtroStatus === "todos" || p.status === filtroStatus)
      .filter((p) =>
        !q ||
        [p.numero, p.empresa, p.cidade, p.bairro, p.endereco, p.destino, p.finalidade, ...p.itens.map((i) => i.descricao)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => Number(b.numero) - Number(a.numero));
  }, [pedidos, busca, filtroStatus]);

  const contagem = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    pedidos.forEach((p) => c[p.status]++);
    return c;
  }, [pedidos]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setImportando("Lendo arquivos…");
    try {
      const res = await importarArquivos([...files], new Set(pedidos.map((p) => p.id)), (d, t) =>
        setImportando(`Lendo pedidos ${d}/${t}`),
      );
      adicionar(res.novos);
      toast.success(`${res.novos.length} pedidos novos`, {
        description: `${res.duplicados} já existiam (ignorados) · ${res.ignorados.length} arquivos não são PC`,
      });
    } catch (e) {
      toast.error("Não foi possível ler o arquivo", { description: String(e) });
    } finally {
      setImportando(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const selecionado = pedidos.find((p) => p.id === sel) ?? null;
  const onSelect = useCallback((id: string) => setSel(id), []);

  const gmapsUrl = rota.length
    ? `https://www.google.com/maps/dir/${[DEPOSITO, ...rota, DEPOSITO].map((p) => `${p.lat},${p.lng}`).join("/")}`
    : "";

  return (
    <div className="flex h-screen flex-col bg-background font-sans text-foreground">
      <Toaster />
      <header className="flex items-center gap-4 border-b border-sidebar-border bg-sidebar px-5 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold leading-none">Roteirizador de Coletas</h1>
            <p className="text-xs opacity-70">Pedidos de compra importados do WhatsApp</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 font-mono text-xs">
          {STATUSES.map((s) => (
            <span key={s} className="hidden items-center gap-1.5 lg:flex">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />
              {STATUS_LABEL[s]} <b>{contagem[s]}</b>
            </span>
          ))}
          {geoFila > 0 && (
            <span className="flex items-center gap-1 text-sidebar-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> localizando {geoFila}
            </span>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".zip,.pdf" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!importando}
          className="flex items-center gap-2 rounded bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importando ?? "Importar conversa (.zip)"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-card">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por nº do pedido, empresa, cidade, item…"
                className="w-full rounded border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(["todos", ...STATUSES] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    filtroStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {s === "todos" ? `Todos ${pedidos.length}` : `${STATUS_LABEL[s]} ${contagem[s]}`}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!pedidos.length && ready && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Upload className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Importe o .zip exportado do WhatsApp. Todos os PDFs de pedido de compra serão lidos. Importar o mesmo arquivo de novo não duplica nada.
              </div>
            )}
            {lista.map((p) => (
              <div
                key={p.id}
                onClick={() => setSel(p.id)}
                className={`cursor-pointer border-b border-border px-3 py-2.5 hover:bg-muted ${sel === p.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={p.status === "rota"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => update(p.id, { status: e.target.checked ? "rota" : "aguardando" })}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    title="Enviar para rota de coleta"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">PC {p.numero}</span>
                      <span className={`h-2 w-2 rounded-full ${DOT[p.status]}`} />
                      <span className="text-xs text-muted-foreground">{STATUS_LABEL[p.status]}</span>
                      {p.lat == null && (
                        <MapPin className={`ml-auto h-3.5 w-3.5 ${p.geoFalhou ? "text-destructive" : "text-muted-foreground"}`} />
                      )}
                    </div>
                    <div className="truncate text-sm font-medium">{p.empresa}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.bairro} · {p.cidade || "—"}/{p.uf} {p.destino && `· ${p.destino}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pedidos.length > 0 && (
            <button
              onClick={() => confirm("Apagar todos os pedidos importados?") && limpar()}
              className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Limpar tudo
            </button>
          )}
        </aside>

        {/* Mapa */}
        <main className="relative min-w-0 flex-1">
          <ClientOnly fallback={<div className="h-full w-full bg-muted" />}>
            <Suspense fallback={<div className="h-full w-full bg-muted" />}>
              <RouteMap pedidos={pedidos} rota={rota} rotaGeo={rotaGeo} selecionado={sel} onSelect={onSelect} />
            </Suspense>
          </ClientOnly>

          {selecionado && (
            <div className="absolute left-4 top-4 z-[1000] max-h-[calc(100%-2rem)] w-[360px] overflow-y-auto rounded-md border border-border bg-card p-4 shadow-lg">
              <button onClick={() => setSel(null)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              <div className="font-mono text-xs text-muted-foreground">PC {selecionado.numero} · {selecionado.dataDocumento}</div>
              <h2 className="font-display text-lg font-bold leading-tight">{selecionado.empresa}</h2>
              <p className="mt-1 text-sm">
                {selecionado.endereco}
                <br />
                {selecionado.bairro} · {selecionado.cidade}/{selecionado.uf} · CEP {selecionado.cep}
              </p>
              {selecionado.geoFalhou && <p className="mt-1 text-xs text-destructive">Endereço não localizado no mapa.</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Destino</dt><dd>{selecionado.destino || "—"}</dd>
                <dt className="text-muted-foreground">Finalidade</dt><dd>{selecionado.finalidade}</dd>
                <dt className="text-muted-foreground">Pagamento</dt><dd>{selecionado.pagamento}</dd>
                <dt className="text-muted-foreground">Comprador</dt><dd>{selecionado.comprador}</dd>
                <dt className="text-muted-foreground">Entrega</dt><dd>{selecionado.dataEntrega}</dd>
                <dt className="text-muted-foreground">Valor</dt><dd className="font-semibold">{selecionado.valorTotal}</dd>
              </dl>
              {selecionado.itens.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
                  {selecionado.itens.map((i, k) => (
                    <li key={k}><span className="font-mono">{i.quant} {i.un}</span> — {i.descricao}</li>
                  ))}
                </ul>
              )}
              {selecionado.observacoes && <p className="mt-2 text-xs italic text-muted-foreground">{selecionado.observacoes}</p>}
              <div className="mt-3 grid grid-cols-2 gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => update(selecionado.id, { status: s })}
                    className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs ${
                      selecionado.status === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${DOT[s]}`} /> {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { remover(selecionado.id); setSel(null); }}
                className="mt-2 text-xs text-muted-foreground hover:text-destructive"
              >
                Remover pedido
              </button>
            </div>
          )}

          {/* Rota */}
          <div className="absolute bottom-4 right-4 z-[1000] w-[320px] rounded-md border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2 text-accent-foreground">
              <span className="flex items-center gap-2 font-display font-bold"><Navigation className="h-4 w-4" /> Rota de coleta</span>
              <span className="font-mono text-xs">
                {rota.length} paradas{rotaInfo && ` · ${rotaInfo.km.toFixed(0)} km · ${Math.round(rotaInfo.min)} min`}
              </span>
            </div>
            <ol className="max-h-64 overflow-y-auto text-sm">
              {!rota.length && <li className="p-3 text-xs text-muted-foreground">Marque pedidos na lista para montar a rota.</li>}
              {rota.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-status-rota font-mono text-[10px] font-bold text-accent-foreground">{i + 1}</span>
                  <button onClick={() => setSel(p.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-xs font-medium">{p.empresa}</div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">PC {p.numero} · {p.cidade}</div>
                  </button>
                  <button title="Marcar como coletado" onClick={() => update(p.id, { status: "coletado" })} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-status-coletado hover:bg-muted">✓</button>
                  <button title="Tirar da rota" onClick={() => update(p.id, { status: "aguardando" })} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ol>
            {semLocal > 0 && <p className="px-3 py-1 text-[11px] text-destructive">{semLocal} pedido(s) na rota ainda sem localização.</p>}
            {rota.length > 0 && (
              <a href={gmapsUrl} target="_blank" rel="noreferrer" className="block bg-primary py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90">
                Abrir rota no Google Maps
              </a>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
