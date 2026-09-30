import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UA = "RoteirizadorColetas/1.0 (compras@drilling.com.br)";

async function nominatim(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" } });
  if (!r.ok) return null;
  const j = (await r.json()) as { lat: string; lon: string }[];
  return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
}

export const geocodeEndereco = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        endereco: z.string().max(300),
        bairro: z.string().max(120),
        cidade: z.string().max(120),
        uf: z.string().max(4),
        cep: z.string().max(20),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let { cidade, uf, bairro } = data;
    let rua = data.endereco.split(" - ")[0];
    let viaRua = "";
    const cep = data.cep.replace(/\D/g, "");
    // Enrich with ViaCEP (fixes missing/truncated city names)
    if (cep.length === 8) {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (r.ok) {
          const v = (await r.json()) as { localidade?: string; uf?: string; bairro?: string; logradouro?: string; erro?: boolean };
          if (!v.erro) {
            cidade = v.localidade || cidade;
            uf = v.uf || uf;
            bairro = bairro || v.bairro || "";
            if (v.logradouro) viaRua = v.logradouro;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const numero = rua.match(/,\s*(\d+)/)?.[1] ?? "";
    const street = viaRua || rua.split(",")[0].trim();
    const tries = [
      street && `${street}${numero ? " " + numero : ""}, ${cidade}, ${uf}`,
      street && `${street}, ${bairro}, ${cidade}, ${uf}`,
      bairro && `${bairro}, ${cidade}, ${uf}`,
      cidade && `${cidade}, ${uf}`,
    ].filter(Boolean) as string[];
    for (const q of tries) {
      const res = await nominatim(q);
      if (res) return { ...res, cidade, uf, precisao: q === tries[0] ? "endereco" : "aproximado" };
      await new Promise((r) => setTimeout(r, 1100));
    }
    return null;
  });
