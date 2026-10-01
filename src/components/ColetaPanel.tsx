import { useEffect, useState } from "react";
import { Play, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import type { Coleta, Pedido } from "@/lib/pc-parser";

const num = (s: string) => {
  const n = Number(String(s ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const hora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function ColetaPanel({ pedido, onUpdate }: { pedido: Pedido; onUpdate: (patch: Partial<Pedido>) => void }) {
  const [qtd, setQtd] = useState<string[]>([]);
  useEffect(() => setQtd(pedido.itens.map((i) => fmt(num(i.quant)))), [pedido.id, pedido.itens]);

  const iniciar = () => onUpdate({ coletaInicio: new Date().toISOString(), status: "rota" });

  const encerrar = (tipo: "total" | "parcial") => {
    const fim = new Date().toISOString();
    const itens = pedido.itens.map((i, k) => ({
      descricao: i.descricao,
      un: i.un,
      pedido: i.quant,
      coletado: tipo === "total" ? i.quant : qtd[k] ?? "0",
    }));
    const coleta: Coleta = { inicio: pedido.coletaInicio!, fim, tipo, itens };
    const coletas = [...(pedido.coletas ?? []), coleta];
    if (tipo === "total") {
      onUpdate({ coletas, coletaInicio: undefined, status: "coletado", pendenteParaDia: undefined });
      return;
    }
    const faltam = pedido.itens
      .map((i, k) => ({ ...i, quant: fmt(Math.max(0, num(i.quant) - num(qtd[k] ?? "0"))) }))
      .filter((i) => num(i.quant) > 0);
    if (!faltam.length) {
      onUpdate({ coletas: [...coletas.slice(0, -1), { ...coleta, tipo: "total" }], coletaInicio: undefined, status: "coletado" });
      return;
    }
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    onUpdate({
      coletas,
      itens: faltam,
      coletaInicio: undefined,
      status: "aguardando",
      pendenteParaDia: amanha.toISOString().slice(0, 10),
    });
  };

  return (
    <div className="mt-3 rounded border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <Clock className="h-3.5 w-3.5" /> Coleta
      </div>

      {pedido.pendenteParaDia && !pedido.coletaInicio && (
        <p className="mb-2 rounded bg-status-aguardando/20 px-2 py-1 text-xs">
          Pendente da coleta parcial — retornar em {new Date(pedido.pendenteParaDia + "T12:00").toLocaleDateString("pt-BR")} (só itens faltantes).
        </p>
      )}

      {!pedido.coletaInicio ? (
        pedido.status !== "coletado" && (
          <button onClick={iniciar} className="flex w-full items-center justify-center gap-2 rounded bg-accent py-3 text-sm font-bold text-accent-foreground hover:opacity-90">
            <Play className="h-4 w-4" /> Iniciar coleta
          </button>
        )
      ) : (
        <>
          <p className="mb-2 text-xs">Iniciada em <b>{hora(pedido.coletaInicio)}</b></p>
          {pedido.itens.length > 0 && (
            <ul className="mb-2 space-y-1">
              {pedido.itens.map((i, k) => (
                <li key={k} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate" title={i.descricao}>{i.descricao}</span>
                  <input
                    value={qtd[k] ?? ""}
                    onChange={(e) => setQtd((q) => q.map((v, j) => (j === k ? e.target.value : v)))}
                    className="w-16 rounded border border-input bg-background px-1 py-0.5 text-right font-mono"
                    inputMode="decimal"
                  />
                  <span className="w-20 shrink-0 font-mono text-muted-foreground">/ {i.quant} {i.un}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-2 text-[11px] text-muted-foreground">Na parcial, informe quanto foi coletado de cada item.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => encerrar("total")} className="flex items-center justify-center gap-1 rounded bg-status-coletado py-3 text-sm font-bold text-primary-foreground hover:opacity-90">
              <CheckCircle2 className="h-4 w-4" /> Total
            </button>
            <button onClick={() => encerrar("parcial")} className="flex items-center justify-center gap-1 rounded bg-status-aguardando py-3 text-sm font-bold text-foreground hover:opacity-90">
              <CircleDashed className="h-4 w-4" /> Parcial
            </button>
          </div>
        </>
      )}

      {!!pedido.coletas?.length && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Histórico</div>
          {pedido.coletas.map((c, k) => (
            <div key={k} className="mb-1 text-[11px]">
              <b className={c.tipo === "total" ? "text-status-coletado" : ""}>{c.tipo === "total" ? "Total" : "Parcial"}</b> · {hora(c.inicio)} → {hora(c.fim)}
              {c.tipo === "parcial" && (
                <div className="text-muted-foreground">
                  {c.itens.map((i) => `${i.coletado}/${i.pedido} ${i.un}`).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
