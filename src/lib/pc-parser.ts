// Parses SAP Business One "PEDIDO DE COMPRA" text (lines made of cells separated by " | ").
export type PedidoItem = { codigo: string; descricao: string; un: string; quant: string; total: string };

export type Pedido = {
  id: string; // numero do pedido (dedupe key)
  numero: string;
  empresa: string;
  cnpj: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  finalidade: string;
  pagamento: string;
  comprador: string;
  dataDocumento: string;
  dataEntrega: string;
  valorTotal: string;
  observacoes: string;
  itens: PedidoItem[];
  arquivo: string;
  destino: string; // texto entre parênteses do nome do arquivo
  status: Status;
  lat?: number;
  lng?: number;
  geoFalhou?: boolean;
  importadoEm: string;
};

export type Status = "aguardando" | "rota" | "estoque" | "fabricacao" | "coletado";

export const STATUS_LABEL: Record<Status, string> = {
  aguardando: "Aguardando retirada",
  rota: "Rota de coleta",
  estoque: "Estoque",
  fabricacao: "Fabricação",
  coletado: "Coletado",
};

function cellAfter(lines: string[], label: RegExp, from = 0): { value: string; line: number } | null {
  for (let i = from; i < lines.length; i++) {
    const cells = lines[i].split(" | ");
    for (let c = 0; c < cells.length; c++) {
      const m = cells[c].match(label);
      if (m) {
        const rest = cells[c].slice(m.index! + m[0].length).trim();
        if (rest) return { value: /:\s*$/.test(rest) ? "" : rest, line: i };
        const next = (cells[c + 1] ?? "").trim();
        return { value: /:\s*$/.test(next) ? "" : next, line: i };
      }
    }
  }
  return null;
}

export function parsePedido(lines: string[], arquivo: string): Omit<Pedido, "status" | "importadoEm"> | null {
  const text = lines.join("\n");
  if (!/PEDIDO DE COMPRA/i.test(text)) return null;
  const num = cellAfter(lines, /N[ºo°]\s*do documento:/i);
  if (!num?.value) return null;
  const numero = num.value.replace(/\D/g, "");
  if (!numero) return null;

  // Supplier block begins at the line with F + 14 digits code
  let supIdx = lines.findIndex((l) => /(^| \| )F\d{11,14}( \| |$)/.test(l));
  let empresa = "";
  if (supIdx >= 0) {
    const cells = lines[supIdx].split(" | ");
    const k = cells.findIndex((c) => /^F\d{11,14}$/.test(c.trim()));
    empresa = (cells[k + 1] ?? "").trim();
    // continuation line (e.g. "LTDA")
    const nxt = lines[supIdx + 2]?.split(" | ")[0]?.trim();
    if (nxt && /^[A-Z ]{2,20}$/.test(nxt) && !/:/.test(nxt)) empresa += " " + nxt;
  } else supIdx = 0;

  const g = (re: RegExp) => cellAfter(lines, re, supIdx)?.value ?? "";
  const endereco = g(/^Endere[çc]o:/i).replace(/\s*,\s*/g, ", ").replace(/[\s,-]+$/, "").replace(/^[\s,]+/, "");
  const bairro = g(/^Bairro:/i);
  const cidade = g(/Cidade:/i);
  const uf = g(/^Estado:/i).slice(0, 2);
  const cep = g(/CEP:/i);
  const cnpjRaw = g(/^CNPJ:/i);
  const cnpj = /\d/.test(cnpjRaw) && !/I\.E/.test(cnpjRaw) ? cnpjRaw : "";

  const itens: PedidoItem[] = [];
  for (const l of lines) {
    const cells = l.split(" | ").map((c) => c.trim());
    if (/^[A-Z]{2}\d{4,}$/.test(cells[0]) && cells.length >= 5) {
      itens.push({ codigo: cells[0], descricao: cells[1], un: cells[2], quant: cells[3], total: cells[cells.length - 2] ?? "" });
    }
  }
  const obsIdx = lines.findIndex((l) => /Observa[çc][õo]es do pedido/i.test(l));
  const observacoes = obsIdx >= 0 ? (lines[obsIdx + 1] ?? "").split(" | ")[0] : "";
  const destino = arquivo.match(/\(([^)]*)\)/)?.[1] ?? "";

  return {
    id: numero,
    numero,
    empresa,
    cnpj,
    endereco,
    bairro,
    cidade,
    uf,
    cep,
    finalidade: g(/Finalidade:/i),
    pagamento: g(/Condi[çc][õo]es de pagamento:/i),
    comprador: g(/Vendedor \/ Comprador:/i),
    dataDocumento: g(/Data do documento:/i).split(" ")[0],
    dataEntrega: g(/Data de entrega:/i).split(" ")[0],
    valorTotal: cellAfter(lines, /Valor Total:/i)?.value ?? "",
    observacoes,
    itens,
    arquivo,
    destino,
  };
}

type TItem = { str: string; transform: number[]; width: number };

export function itemsToLines(items: TItem[]): string[] {
  const rows: { y: number; parts: TItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5]!;
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.transform[4]! - b.transform[4]!);
    let out = "";
    let lastEnd = -Infinity;
    for (const p of r.parts) {
      const x = p.transform[4]!;
      if (out) out += x - lastEnd > 8 ? " | " : x - lastEnd > 1 ? " " : "";
      out += p.str.trim();
      lastEnd = x + p.width;
    }
    return out;
  });
}
