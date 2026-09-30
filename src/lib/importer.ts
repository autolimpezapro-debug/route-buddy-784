import { itemsToLines, parsePedido, type Pedido } from "./pc-parser";

export type ImportResult = { novos: Pedido[]; duplicados: number; ignorados: string[] };

async function pdfToLines(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  return itemsToLines(tc.items as never);
}

export async function importarArquivos(
  files: File[],
  existentes: Set<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const JSZip = (await import("jszip")).default;
  const pdfs: { name: string; data: Uint8Array }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const zip = await JSZip.loadAsync(f);
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && /\.pdf$/i.test(entry.name)) {
          pdfs.push({ name: entry.name.split("/").pop()!, data: await entry.async("uint8array") });
        }
      }
    } else if (/\.pdf$/i.test(f.name)) {
      pdfs.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  const vistos = new Set(existentes);
  const novos: Pedido[] = [];
  const ignorados: string[] = [];
  let duplicados = 0;
  for (let i = 0; i < pdfs.length; i++) {
    onProgress?.(i, pdfs.length);
    try {
      const p = parsePedido(await pdfToLines(pdfs[i].data), pdfs[i].name);
      if (!p) ignorados.push(pdfs[i].name);
      else if (vistos.has(p.id)) duplicados++;
      else {
        vistos.add(p.id);
        novos.push({ ...p, status: "aguardando", importadoEm: new Date().toISOString() });
      }
    } catch {
      ignorados.push(pdfs[i].name);
    }
  }
  onProgress?.(pdfs.length, pdfs.length);
  return { novos, duplicados, ignorados };
}
