import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pedido } from "@/lib/pc-parser";
import { STATUS_LABEL } from "@/lib/pc-parser";
import { DEPOSITO } from "@/lib/store";

type Props = {
  pedidos: Pedido[];
  rota: Pedido[];
  rotaGeo: [number, number][] | null;
  selecionado: string | null;
  onSelect: (id: string) => void;
};

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function RouteMap({ pedidos, rota, rotaGeo, selecionado, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView([DEPOSITO.lat, DEPOSITO.lng], 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const ordem = new Map(rota.map((p, i) => [p.id, i + 1]));

    if (rota.length) {
      const line: [number, number][] = rotaGeo ?? [
        [DEPOSITO.lat, DEPOSITO.lng],
        ...rota.map((p) => [p.lat!, p.lng!] as [number, number]),
        [DEPOSITO.lat, DEPOSITO.lng],
      ];
      L.polyline(line, { color: cssVar("--status-rota"), weight: 5, opacity: 0.85, dashArray: rotaGeo ? undefined : "6 8" }).addTo(g);
    }

    const depot = L.divIcon({ className: "", html: `<div class="pin pin-depot">D</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
    L.marker([DEPOSITO.lat, DEPOSITO.lng], { icon: depot, zIndexOffset: 1000 }).bindTooltip(DEPOSITO.nome).addTo(g);

    const bounds: [number, number][] = [[DEPOSITO.lat, DEPOSITO.lng]];
    for (const p of pedidos) {
      if (p.lat == null || p.lng == null) continue;
      bounds.push([p.lat, p.lng]);
      const n = ordem.get(p.id);
      const sel = p.id === selecionado ? " pin-sel" : "";
      const icon = L.divIcon({
        className: "",
        html: `<div class="pin pin-${p.status}${sel}">${n ?? ""}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([p.lat, p.lng], { icon, zIndexOffset: n ? 500 : 0 })
        .bindTooltip(`<b>PC ${p.numero}</b> · ${p.empresa}<br/>${STATUS_LABEL[p.status]}`)
        .on("click", () => onSelect(p.id))
        .addTo(g);
    }
    if (!fitted.current && bounds.length > 1) {
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      fitted.current = true;
    }
  }, [pedidos, rota, rotaGeo, selecionado, onSelect]);

  useEffect(() => {
    const p = pedidos.find((x) => x.id === selecionado);
    if (p?.lat != null && map.current) map.current.panTo([p.lat, p.lng!]);
  }, [selecionado]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-full w-full" />;
}
