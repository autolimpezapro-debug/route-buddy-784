import { useCallback, useEffect, useRef, useState } from "react";
import type { Pedido } from "./pc-parser";
import { supabase } from "@/integrations/supabase/client";

const LEGACY_KEY = "roteirizador.pedidos.v1";

async function salvar(ps: Pedido[]) {
  if (!ps.length) return;
  const { error } = await supabase
    .from("pedidos")
    .upsert(ps.map((p) => ({ id: p.id, dados: p as never, updated_at: new Date().toISOString() })));
  if (error) console.error("Erro ao salvar pedidos", error);
}

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ready, setReady] = useState(false);
  const ref = useRef<Pedido[]>([]);
  ref.current = pedidos;

  useEffect(() => {
    let ativo = true;
    (async () => {
      const all: Pedido[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("pedidos").select("dados").range(from, from + 999);
        if (error) { console.error(error); break; }
        all.push(...(data ?? []).map((r) => r.dados as unknown as Pedido));
        if (!data || data.length < 1000) break;
      }
      // Migrate data that was saved only in this browser before
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        if (raw) {
          const ids = new Set(all.map((p) => p.id));
          const legacy = (JSON.parse(raw) as Pedido[]).filter((p) => !ids.has(p.id));
          await salvar(legacy);
          all.push(...legacy);
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch { /* ignore */ }
      if (!ativo) return;
      setPedidos(all);
      setReady(true);
    })();

    const ch = supabase
      .channel("pedidos-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          setPedidos((ps) => ps.filter((p) => p.id !== id));
        } else {
          const p = (payload.new as { dados: Pedido }).dados;
          setPedidos((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]));
        }
      })
      .subscribe();
    return () => { ativo = false; supabase.removeChannel(ch); };
  }, []);

  const update = useCallback((id: string, patch: Partial<Pedido>) => {
    const atual = ref.current.find((p) => p.id === id);
    if (!atual) return;
    const novo = { ...atual, ...patch };
    setPedidos((ps) => ps.map((p) => (p.id === id ? novo : p)));
    void salvar([novo]);
  }, []);

  // Merge keyed by order number: never duplicates
  const adicionar = useCallback((novos: Pedido[]) => {
    const ids = new Set(ref.current.map((p) => p.id));
    const add = novos.filter((n) => !ids.has(n.id));
    setPedidos((ps) => [...ps, ...add]);
    // ignoreDuplicates keeps existing records (with their status/coletas) untouched
    if (add.length)
      void supabase
        .from("pedidos")
        .upsert(add.map((p) => ({ id: p.id, dados: p as never })), { onConflict: "id", ignoreDuplicates: true })
        .then(({ error }) => error && console.error(error));
  }, []);

  const remover = useCallback((id: string) => {
    setPedidos((ps) => ps.filter((p) => p.id !== id));
    void supabase.from("pedidos").delete().eq("id", id);
  }, []);
  const limpar = useCallback(() => {
    setPedidos([]);
    void supabase.from("pedidos").delete().neq("id", "");
  }, []);

  return { pedidos, ready, update, adicionar, remover, limpar };
}

export const DEPOSITO = { lat: -19.6986, lng: -43.9586, nome: "Drilling do Brasil — Depósito (São José da Lapa)" };

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Nearest-neighbour ordering starting from the depot; stops at the same location are grouped
export function ordenarRota(ps: Pedido[]): Pedido[] {
  const rest = ps.filter((p) => p.lat != null);
  const out: Pedido[] = [];
  let cur = DEPOSITO as { lat: number; lng: number };
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => {
      const d = distKm(cur, p as { lat: number; lng: number });
      if (d < bd) (bd = d), (bi = i);
    });
    const [n] = rest.splice(bi, 1);
    out.push(n!);
    cur = n! as { lat: number; lng: number };
  }
  return out;
}
