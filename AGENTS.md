# Agents notes
- Orders stored in browser localStorage keyed by PC number — no backend requested; dedupe on import by PC number.
- PDFs parsed client-side (pdfjs + jszip) in src/lib/pc-parser.ts — SAP B1 layout, lines of cells joined by " | ".
- Geocoding via server fn (ViaCEP + Nominatim, 1 req/s); road route via public OSRM; tiles from OSM.
