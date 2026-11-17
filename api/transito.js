// Trânsito agora em São Paulo (capital).
//   /api/transito         -> lentidão por região, tendência, rodízio e velocidade dos ônibus (página inicial da CET-SP)
//   /api/transito?geo=1   -> contornos das subprefeituras (GeoSampa) com a região de cada uma, para colorir o mapa
const UA = { "User-Agent": "Mozilla/5.0 painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)" };
const REG = { centro: ["SE"], norte: ["PERUS", "PIRITUBA", "JARAGUA", "FREGUESIA", "BRASILANDIA", "CASA VERDE", "CACHOEIRINHA", "SANTANA", "TUCURUVI", "JACANA", "TREMEMBE", "VILA MARIA", "VILA GUILHERME"],
  oeste: ["LAPA", "BUTANTA", "PINHEIROS"], sul: ["IPIRANGA", "VILA MARIANA", "JABAQUARA", "SANTO AMARO", "CIDADE ADEMAR", "CAMPO LIMPO", "M BOI MIRIM", "MBOI MIRIM", "CAPELA DO SOCORRO", "PARELHEIROS"],
  leste: ["MOOCA", "ARICANDUVA", "CARRAO", "FORMOSA", "VILA PRUDENTE", "SAPOPEMBA", "PENHA", "ERMELINO", "SAO MIGUEL", "ITAIM PAULISTA", "GUAIANASES", "ITAQUERA", "CIDADE TIRADENTES", "SAO MATEUS"] };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, " ").toUpperCase().replace(/\s+/g, " ").trim();
function regiao(nome) { const n = norm(nome); if (n === "SE" || /^SE\b/.test(n)) return "centro"; for (const [r, L] of Object.entries(REG)) if (r !== "centro" && L.some(x => n.includes(x))) return r; return null; }
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let mx = 0, mi = -1; const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) { let t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L; t = Math.max(0, Math.min(1, t)); const ex = pts[i][0] - ax - t * dx, ey = pts[i][1] - ay - t * dy, d = ex * ex + ey * ey; if (d > mx) { mx = d; mi = i; } }
    if (mi > 0 && mx > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
module.exports = async (req, res) => {
  const q = req.query || {}, c = new AbortController(), tm = setTimeout(() => c.abort(), 12000);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (q.geo) {
      const r = await fetch("http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=geoportal:subprefeitura&outputFormat=application/json&srsName=EPSG:4326", { signal: c.signal, headers: UA });
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json(), feats = [];
      for (const f of j.features || []) {
        const p = f.properties || {}, nome = p.nm_subprefeitura || p.nome || p.nm_subpref || Object.values(p).find(v => typeof v === "string" && v.length > 2) || "", g = f.geometry; if (!g) continue;
        const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
        feats.push({ nome: String(nome), regiao: regiao(nome), polys: polys.map(pg => [simplify(pg[0].map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]), 0.0006)]) });
      }
      res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
      res.statusCode = 200; res.end(JSON.stringify({ fonte: "GeoSampa (Prefeitura de São Paulo)", props: Object.keys(((j.features || [])[0] || {}).properties || {}), subprefeituras: feats })); return;
    }
    const r = await fetch("https://www.cetsp.com.br/", { signal: c.signal, headers: UA });
    if (!r.ok) throw new Error("http " + r.status);
    const h = await r.text(), i = h.indexOf('id="transitoAgora"'); if (i < 0) throw new Error("bloco Trânsito Agora não encontrado");
    const b = h.slice(i, i + 9000), zonas = {};
    const re = /class="info (\w+)">[\s\S]*?<h4>\s*([\d.,]+)\s*km\s*<\/h4>[\s\S]*?class="desc">\s*\(([\d.,]+)%\)\s*<img[^>]*src="[^"]*\/(\w+)\.gif"/g; let m;
    while ((m = re.exec(b))) zonas[m[1].toLowerCase()] = { km: +m[2].replace(/\./g, "").replace(",", "."), pct: +m[3].replace(",", "."), tend: m[4].toUpperCase() === "ALTA" ? "subindo" : m[4].toUpperCase() === "BAIXA" ? "caindo" : "estavel" };
    const dia = (b.match(/<li>\s*(S[ãa]o Paulo,[^<]+)<\/li>/) || [])[1] || "", rod = ((b.match(/Rod[ií]zio:\s*([^<]+)</) || [])[1] || "").trim();
    const vel = [...b.matchAll(/<strong class="valor">\s*([\d,]+)\s*km\/h\s*<\/strong>[\s\S]*?<span>([^<]+)<\/span>/g)].map(x => ({ sentido: x[2].trim(), kmh: +x[1].replace(",", ".") }));
    if (!Object.keys(zonas).length) throw new Error("não foi possível ler a lentidão");
    const total = Object.values(zonas).reduce((s, z) => s + z.km, 0);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.statusCode = 200; res.end(JSON.stringify({ fonte: "CET-SP (cetsp.com.br, Trânsito Agora)", lido: new Date().toISOString(), dia, rodizio: rod, total, zonas, onibus: vel }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: e.name === "AbortError" ? "tempo esgotado" : e.message }));
  } finally { clearTimeout(tm); }
};
