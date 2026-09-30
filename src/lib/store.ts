import { useCallback, useEffect, useState } from "react";
import type { Pedido } from "./pc-parser";

const KEY = "roteirizador.pedidos.v1";

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPedidos(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(pedidos));
  }, [pedidos, ready]);

  const update = useCallback((id: string, patch: Partial<Pedido>) => {
    setPedidos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // Merge keyed by order number: never duplicates
  const adicionar = useCallback((novos: Pedido[]) => {
    setPedidos((ps) => {
      const ids = new Set(ps.map((p) => p.id));
      return [...ps, ...novos.filter((n) => !ids.has(n.id))];
    });
  }, []);

  const remover = useCallback((id: string) => setPedidos((ps) => ps.filter((p) => p.id !== id)), []);
  const limpar = useCallback(() => setPedidos([]), []);

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
