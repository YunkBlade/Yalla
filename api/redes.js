// Lojas oficiais das grandes redes, lidas das páginas públicas de cada marca.
//   /api/redes            -> Localiza: agências do Brasil a partir do sitemap oficial e dos dados estruturados
//                            (schema.org LocalBusiness) que o próprio site publica em cada página de cidade.
// Resultado guardado no cache por 7 dias para não sobrecarregar o site da marca.
const UA = { "User-Agent": "Mozilla/5.0 (compatible; painel-relatorios/1.0; +https://yalla-relatorios.vercel.app)", "Accept": "text/html,application/xml;q=0.9", "Accept-Language": "pt-BR,pt;q=0.9" };
const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
async function txt(url, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000); try { const r = await fetch(url, { signal: c.signal, headers: UA, redirect: "follow" }); if (!r.ok) throw new Error("http " + r.status); return await r.text(); } finally { clearTimeout(t); } }
const cap = s => String(s || "").toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, w => w.toLowerCase());

const FORA = /\/(eua|italia|espanha|alemanha|portugal|mexico|uruguai|africa|argentina|chile|colombia|paraguai|peru|equador|franca|inglaterra|canada|aluguel-de-carros-no-exterior)/;
async function localiza(limite) {
  const t0 = Date.now(), base = "https://www.localiza.com/brasil/pt-br/rede-de-agencias";
  const sm = await txt("https://www.localiza.com/sitemap-pt-br.xml", 15000);
  const fila = [base, ...new Set((sm.match(/https:\/\/www\.localiza\.com\/brasil\/pt-br\/rede-de-agencias\/[a-z0-9-]+/g) || []))].filter(u => !FORA.test(u));
  const vistos = new Set(fila), lojas = new Map(), max = limite || 900; let ok = 0, falhas = 0, i = 0;
  const um = async () => {
    while (i < fila.length && i < max && Date.now() - t0 < 48000) {
      const u = fila[i++];
      try {
        const h = await txt(u, 12000); ok++;
        for (const m of h.matchAll(/\/brasil\/pt-br\/rede-de-agencias\/([a-z0-9-]+)/g)) { const n = base + "/" + m[1]; if (!vistos.has(n) && !FORA.test(n)) { vistos.add(n); fila.push(n); } }
        for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
          let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
          for (const o of [].concat(j)) {
            if (!o || o["@type"] !== "LocalBusiness" || o.latitude == null) continue;
            const a = o.address || {}, uf = String(a.addressRegion || "").toUpperCase();
            if (!UFS.has(uf)) continue;
            const lat = +o.latitude, lng = +o.longitude; if (!isFinite(lat) || !isFinite(lng) || lat > 6 || lat < -34.5 || lng > -28 || lng < -74.5) continue;
            const end = cap(a.streetAddress), k = lat.toFixed(4) + "," + lng.toFixed(4);
            if (!lojas.has(k)) lojas.set(k, [+lng.toFixed(6), +lat.toFixed(6), end, cap(a.addressLocality), uf]);
          }
        }
      } catch (e) { falhas++; }
    }
  };
  await Promise.all(Array.from({ length: 14 }, um));
  return { paginas: fila.length, lidas: ok, falhas, completo: i >= fila.length, lojas: [...lojas.values()] };
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const t0 = Date.now(), l = await localiza(+((req.query || {}).limite) || 0);
    if (!l.lojas.length) throw new Error("nenhuma agência lida (" + l.falhas + " falhas)");
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=1209600");
    res.statusCode = 200;
    res.end(JSON.stringify({ gerado: new Date().toISOString(), ms: Date.now() - t0, redes: { localiza: { fonte: "Site oficial da Localiza (páginas da rede de agências, dados estruturados schema.org)", ...l } } }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: e.message }));
  }
};
