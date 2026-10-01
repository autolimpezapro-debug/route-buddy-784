import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Motorista = { id: string; nome: string; lat: number; lng: number; updated_at: string };

// Live positions of all drivers (realtime)
export function useMotoristas() {
  const [ms, setMs] = useState<Motorista[]>([]);
  useEffect(() => {
    supabase.from("motoristas").select("*").then(({ data }) => data && setMs(data as Motorista[]));
    const ch = supabase
      .channel("motoristas-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "motoristas" }, (p) => {
        if (p.eventType === "DELETE") setMs((a) => a.filter((m) => m.id !== (p.old as Motorista).id));
        else {
          const m = p.new as Motorista;
          setMs((a) => [...a.filter((x) => x.id !== m.id), m]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  return ms;
}

// This device shares its GPS while active
export function useRastreio() {
  const [ativo, setAtivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const info = useRef<{ id: string; nome: string } | null>(null);

  const parar = async () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setAtivo(false);
    if (info.current) await supabase.from("motoristas").delete().eq("id", info.current.id);
  };

  const iniciar = () => {
    if (!("geolocation" in navigator)) return setErro("Este aparelho não tem GPS disponível.");
    let id = localStorage.getItem("roteirizador.motorista.id");
    let nome = localStorage.getItem("roteirizador.motorista.nome");
    if (!nome) {
      nome = prompt("Nome do motorista:")?.trim() || "";
      if (!nome) return;
      localStorage.setItem("roteirizador.motorista.nome", nome);
    }
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("roteirizador.motorista.id", id); }
    info.current = { id, nome };
    setErro(null);
    setAtivo(true);
    let ultimo = 0;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const agora = Date.now();
        if (agora - ultimo < 5000) return;
        ultimo = agora;
        void supabase.from("motoristas").upsert({
          id: info.current!.id, nome: info.current!.nome,
          lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString(),
        });
      },
      (e) => setErro(e.code === 1 ? "Permissão de localização negada." : "Não foi possível obter a localização."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };

  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); }, []);
  return { ativo, erro, iniciar, parar };
}
