// Busca de lugares para o mapa do painel (cidade, bairro, rua, endereço).
//   /api/geo?q=texto
// Fonte principal: Photon (komoot), feito para busca enquanto se digita, dados do OpenStreetMap (ODbL).
// Reserva: Nominatim (OpenStreetMap). As duas são consultadas daqui do servidor, com cache,
// para não esbarrar no limite de uso por navegador.
const UA = { "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "application/json", "Accept-Language": "pt-BR,pt;q=0.9" };
async function get(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 6000);
  try { const r = await fetch(url, { signal: c.signal, headers: UA }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const UF = { "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO" };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const uf = s => UF[norm(s)] || (/^[A-Z]{2}$/.test(String(s || "")) ? s : "");
const TIPO = { house: "endereço", street: "rua", locality: "bairro", district: "bairro", city: "cidade", county: "município", state: "estado", country: "país" };

function photon(f) {
  const p = f.properties || {}, g = f.geometry || {}; if (p.countrycode && p.countrycode !== "BR") return null;
  if (!Array.isArray(g.coordinates)) return null;
  const tipo = p.type || "other";
  let main = p.name || "", end = "";
  const poi = tipo === "house" && p.name && p.name !== p.street && p.osm_key !== "place" && p.osm_key !== "building";
  if (tipo === "house") { end = [p.street, p.housenumber].filter(Boolean).join(", "); if (!poi) main = end || main; }
  if (!main) return null;
  const bairro = p.district || p.locality || "", cidade = p.city || p.county || "", u = uf(p.state);
  const sub = [poi && end ? end : "", bairro && bairro !== main ? bairro : "", cidade && cidade !== main ? cidade : "", u].filter(Boolean).join(" · ") || p.state || "";
  const e = p.extent; // [oeste, norte, leste, sul]
  return { main, sub, type: poi ? "local" : (TIPO[tipo] || p.osm_value || tipo), c: [+g.coordinates[0], +g.coordinates[1]], bb: Array.isArray(e) && e.length === 4 ? [[+e[0], +e[3]], [+e[2], +e[1]]] : null };
}
function nominatim(x) {
  const a = x.address || {}, main = x.name || String(x.display_name || "").split(",")[0];
  if (!main) return null;
  const cidade = a.city || a.town || a.municipality || a.village || "", bairro = a.suburb || a.neighbourhood || a.city_district || "", u = (a["ISO3166-2-lvl4"] || "").replace("BR-", "") || uf(a.state);
  const sub = [bairro && bairro !== main ? bairro : "", cidade && cidade !== main ? cidade : "", u].filter(Boolean).join(" · ") || String(x.display_name || "").split(",").slice(1, 3).join(",").trim();
  const b = x.boundingbox;
  return { main, sub, type: x.addresstype || x.type || "", c: [+x.lon, +x.lat], bb: b ? [[+b[2], +b[0]], [+b[3], +b[1]]] : null };
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const q = String((req.query && req.query.q) || "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 2) { res.statusCode = 400; res.end(JSON.stringify({ error: "digite ao menos 2 letras" })); return; }
  const lat = Math.max(-34, Math.min(6, +(req.query.lat || -23.55))) || -23.55, lon = Math.max(-74, Math.min(-34, +(req.query.lon || -46.63))) || -46.63;
  let itens = [], fonte = "", erros = [];
  try {
    const j = await get(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lat=${lat}&lon=${lon}&location_bias_scale=0.3&bbox=-74.1,-33.8,-34.7,5.3`, 5000);
    itens = ((j && j.features) || []).map(photon).filter(Boolean); fonte = "Photon / OpenStreetMap";
  } catch (e) { erros.push("photon: " + (e.name === "AbortError" ? "tempo esgotado" : e.message)); }
  if (!itens.length) {
    try {
      const j = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=8&addressdetails=1&accept-language=pt-BR&q=${encodeURIComponent(q)}`, 6000);
      itens = (Array.isArray(j) ? j : []).map(nominatim).filter(Boolean); fonte = "Nominatim / OpenStreetMap";
    } catch (e) { erros.push("nominatim: " + (e.name === "AbortError" ? "tempo esgotado" : e.message)); }
  }
  const vistos = new Set(); itens = itens.filter(s => { const k = norm(s.main) + "|" + norm(s.sub); if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 8);
  if (!itens.length && erros.length) { res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: "busca indisponível", detalhe: erros })); return; }
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.statusCode = 200; res.end(JSON.stringify({ fonte, itens }));
};
