// Posição exata de um endereço.
//   /api/endereco?q=Av. Dr. Gastão Vidigal, 1087, Vila Leopoldina, São Paulo
// Capital paulista: lote fiscal da Prefeitura (GeoSampa, camada lote_cidadao) com o mesmo número de porta.
// Se o número não existir no cadastro, usa o lote de número mais próximo do mesmo lado da rua.
// Outras cidades: número da rua no OpenStreetMap (Photon); sem número mapeado, devolve a rua e avisa.
const W = "http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs";
const UA = { "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "application/json" };
async function getJ(url, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 12000); try { const r = await fetch(url, { signal: c.signal, headers: UA }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); } finally { clearTimeout(t); } }
const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const TIPOS = /^(AV|AVENIDA|R|RUA|AL|ALAMEDA|PC|PCA|PRACA|EST|ESTR|ESTRADA|ROD|RODOVIA|TV|TRAV|TRAVESSA|LG|LARGO|VD|VIADUTO|VIELA|PQ|PARQUE)$/;
const TITULOS = new Set(["DR", "DOUTOR", "DRA", "PROF", "PROFESSOR", "PROFA", "PREF", "PREFEITO", "ENG", "ENGENHEIRO", "CEL", "CORONEL", "GAL", "GEN", "GENERAL", "DES", "DESEMBARGADOR", "SEN", "SENADOR", "DEP", "DEPUTADO", "PE", "PADRE", "STA", "STO", "SAO", "SANTA", "SANTO", "MAL", "MARECHAL", "PRES", "PRESIDENTE", "BRIG", "BRIGADEIRO", "COM", "COMENDADOR", "CAP", "CAPITAO", "MAJ", "MAJOR", "TEN", "TENENTE", "VER", "VEREADOR", "GOV", "GOVERNADOR", "MIN", "MINISTRO", "D", "DOM", "DONA", "MONS", "MONSENHOR", "BARAO", "BARONESA", "CONS", "CONSELHEIRO", "VISC", "VISCONDE", "INF", "INFANTE"]);
const LIGA = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const NUMS = { NOVE: "9", SETE: "7", VINTE: "20", TRES: "3", QUINZE: "15", DOZE: "12", ONZE: "11", DEZ: "10", CINCO: "5", SEIS: "6", OITO: "8", QUATRO: "4", DOIS: "2", UM: "1", TREZE: "13", CATORZE: "14", QUATORZE: "14", DEZESSEIS: "16", VINTE_E_CINCO: "25" };

function partes(q) {
  const s = String(q || "").replace(/\s+/g, " ").trim();
  const m = s.match(/^([^,]+?),?\s*(?:n[ºo°.]*\s*)?(\d{1,3}(?:\.\d{3})*|\d+)\b(.*)$/i);
  if (!m) return null;
  const rua = m[1].trim(), num = String(+m[2].replace(/\./g, "")), resto = m[3] || "";
  return { rua, num, resto, cidadeSP: !/(osasco|s[aã]o bernardo|santo andr[eé]|s[aã]o caetano|guarulhos|diadema|barueri|mau[aá]|s[aã]o vicente|santos|campinas|carapicu[ií]ba|tabo[aã]o|cotia|mogi|suzano|embu|itapecerica)/i.test(resto) };
}
const ABR = { DOUTOR: "DR", DOUTORA: "DRA", PROFESSOR: "PROF", PROFESSORA: "PROFA", PREFEITO: "PREF", ENGENHEIRO: "ENG", CORONEL: "CEL", GENERAL: "GAL", GEN: "GAL", SENADOR: "SEN", DEPUTADO: "DEP", PADRE: "PE", PRESIDENTE: "PRES", BRIGADEIRO: "BRIG", MARECHAL: "MAL", CONSELHEIRO: "CONS", COMENDADOR: "COM", DESEMBARGADOR: "DES", MINISTRO: "MIN", GOVERNADOR: "GOV", MONSENHOR: "MONS", CAPITAO: "CAP", TENENTE: "TEN", MAJOR: "MAJ", VEREADOR: "VER", VISCONDE: "VISC", AVENIDA: "AV", RUA: "R", ALAMEDA: "AL", PRACA: "PC", ESTRADA: "EST", RODOVIA: "ROD", TRAVESSA: "TV", LARGO: "LG", VIADUTO: "VD" };
const ab = x => ABR[x] || x;
function palavras(rua) {
  const w = sem(rua).split(" ").filter(Boolean); let tipo = "";
  if (w.length && TIPOS.test(w[0])) tipo = ab(w.shift());
  const fortes = w.filter(x => !LIGA.has(x)).map(ab), base = fortes.filter(x => !TITULOS.has(x) && !Object.values(ABR).includes(x) || /^\d+$/.test(x));
  const usa = base.length ? base : fortes, pads = ["%" + usa.join("%") + "%"];
  const conv = usa.map(x => NUMS[x] || x); if (conv.join() !== usa.join()) pads.push("%" + conv.join("%") + "%");
  return { tipo, fortes, pads };
}
function nota(nome, info) {
  const t = sem(nome).split(" ").map(ab); let s = 0;
  for (const f of info.fortes) if (t.includes(f) || t.includes(NUMS[f])) s += 1;
  if (info.tipo && t[0] === info.tipo) s += 0.5;
  return s - Math.max(0, t.length - 1 - info.fortes.length) * 0.25;
}
const km = (a, b) => { const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos((a[1] + b[1]) / 2 * r), y = (b[1] - a[1]) * r; return 6371 * Math.hypot(x, y); };
function melhor(fs, info, ref, num) {
  const c = fs.map(x => ({ x, n: parseInt(x.properties.cd_numero_porta, 10), s: nota(x.properties.nm_logradouro_completo, info), c: centro(x.geometry) }));
  c.forEach(o => { o.d = ref ? km(o.c, ref) : 0; o.dn = num == null ? 0 : Math.abs(o.n - num) + (o.n % 2 !== num % 2 ? 1000 : 0); });
  c.sort((a, b) => (b.s - a.s) || (a.dn - b.dn) || (a.d - b.d));
  return c[0] || null;
}
async function lotes(filtro, max) {
  const url = `${W}?service=WFS&version=1.0.0&request=GetFeature&typeName=geoportal:lote_cidadao&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=${max || 50}&propertyName=nm_logradouro_completo,cd_numero_porta,tx_complemento_endereco,ge_poligono&CQL_FILTER=${encodeURIComponent(filtro)}`;
  const j = await getJ(url, 15000); return (j && j.features) || [];
}
async function geosampa(p, ref) {
  const num = +p.num, info = palavras(p.rua);
  for (const pat of info.pads) {
    const f = await lotes(`nm_logradouro_completo LIKE '${pat.replace(/'/g, "''")}' AND cd_numero_porta='${p.num}'`, 40);
    const b = f.length && melhor(f, info, ref, null);
    if (b && (!ref || b.d < 6)) return { c: b.c, precisao: "lote", detalhe: `${b.x.properties.nm_logradouro_completo}, ${p.num}`, bairro: b.x.properties.tx_complemento_endereco || "" };
  }
  const pref = String(num).length > 2 ? String(num).slice(0, -2) : "";
  for (const pat of info.pads) {
    const f = await lotes(`nm_logradouro_completo LIKE '${pat.replace(/'/g, "''")}'` + (pref ? ` AND cd_numero_porta LIKE '${pref}%'` : ""), 500);
    const ok = f.filter(x => parseInt(x.properties.cd_numero_porta, 10) > 0);
    const b = ok.length && melhor(ok, info, ref, num);
    if (b && Math.abs(b.n - num) <= 120 && (!ref || b.d < 6))
      return { c: b.c, precisao: "lote_proximo", detalhe: `${b.x.properties.nm_logradouro_completo}, ${b.n} (o número mais perto do ${p.num} no cadastro)`, bairro: b.x.properties.tx_complemento_endereco || "" };
  }
  return null;
}
async function photon(q, p) {
  const j = await getJ(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=-23.55&lon=-46.63&bbox=-74.1,-33.8,-34.7,5.3`, 6000);
  const fs = ((j && j.features) || []).filter(f => (f.properties || {}).countrycode === "BR");
  const casa = p && fs.find(f => f.properties.type === "house" && String(f.properties.housenumber || "").replace(/\D/g, "") === p.num);
  if (casa) return { c: casa.geometry.coordinates, precisao: "numero", detalhe: `${casa.properties.street || casa.properties.name}, ${casa.properties.housenumber}` };
  const rua = fs.find(f => f.properties.type === "street") || fs[0];
  if (rua) return { c: rua.geometry.coordinates, precisao: "rua", detalhe: rua.properties.name || "" };
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const q = String((req.query && req.query.q) || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (q.length < 5) { res.statusCode = 400; res.end(JSON.stringify({ error: "endereço curto demais" })); return; }
  const p = partes(q); let r = null; const erros = [];
  let ph = null; try { ph = await photon(q, p); } catch (e) { erros.push("photon: " + e.message); }
  try { if (p && p.cidadeSP) { r = await geosampa(p, ph && ph.precisao === "rua" ? ph.c : (ph && ph.c)); if (r) r.fonte = "Prefeitura de São Paulo (GeoSampa, lote fiscal)"; } } catch (e) { erros.push("geosampa: " + e.message); }
  if (!r && ph) { r = ph; r.fonte = "OpenStreetMap (Photon)"; }
  if (!r) { res.setHeader("Cache-Control", "no-store"); res.statusCode = erros.length ? 502 : 404; res.end(JSON.stringify({ error: "endereço não encontrado", detalhe: erros })); return; }
  res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
  res.statusCode = 200; res.end(JSON.stringify({ q, ...r }));
};
