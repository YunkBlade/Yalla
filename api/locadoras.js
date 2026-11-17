// Locadoras de carro mapeadas no Brasil inteiro (OpenStreetMap, © colaboradores do OpenStreetMap, licença ODbL).
// Classifica por marca: Localiza/Zarp, Movida/Moover, Unidas, Kovi, Foco, locadoras para motorista de app e demais.
const Q = '[out:json][timeout:120];area["ISO3166-1"="BR"]["admin_level"="2"]->.br;(nwr["amenity"="car_rental"](area.br););out center tags;';
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const MARCAS = [
  ["localiza", "Localiza / Zarp", "#22C55E", /localiza|\bzarp\b/],
  ["movida", "Movida / Moover", "#FF7A1A", /movida|moover/],
  ["unidas", "Unidas", "#38BDF8", /\bunidas\b/],
  ["kovi", "Kovi", "#C084FC", /\bkovi\b/],
  ["foco", "Foco", "#F43F5E", /\bfoco\b/],
  ["app", "Locadoras para motorista de app", "#F06CB4", /carro na m[aã]o|loko ?paka|lm ve[ií]culos|alem[aã]o loc|black loc|urban loc|\b957\b|cabral loc|lumina|sampa ?car|motorista(s)? de app|para app|\bapp\b|uber|\b99\b/],
  ["intl", "Redes internacionais", "#A3E635", /hertz|avis|budget|europcar|sixt|enterprise|alamo|national|thrifty|dollar|rent ?a ?car/],
  ["outras", "Outras locadoras", "#94A3B8", /.*/]
];
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const errs = [];
  for (const url of SERVERS) {
    const c = new AbortController(), tm = setTimeout(() => c.abort(), 50000);
    try {
      const r = await fetch(url, { method: "POST", signal: c.signal, body: "data=" + encodeURIComponent(Q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "application/json" } });
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json(), els = j.elements || [];
      if (!els.length) throw new Error("vazio");
      const cont = {}, pts = [];
      for (const e of els) {
        const lat = e.lat ?? (e.center || {}).lat, lon = e.lon ?? (e.center || {}).lon; if (lat == null || lon == null) continue;
        const t = e.tags || {}, txt = norm([t.brand, t.name, t.operator, t["brand:wikidata"] === "Q6664423" ? "localiza" : ""].join(" "));
        const mi = MARCAS.findIndex(m => m[3].test(txt));
        const nome = String(t.name || t.brand || t.operator || "Locadora sem nome").slice(0, 60), cidade = String(t["addr:city"] || "").slice(0, 40);
        pts.push([+(+lon).toFixed(5), +(+lat).toFixed(5), mi, nome, cidade]);
        cont[MARCAS[mi][0]] = (cont[MARCAS[mi][0]] || 0) + 1;
      }
      const marcas = MARCAS.map(m => ({ k: m[0], nome: m[1], cor: m[2], n: cont[m[0]] || 0 }));
      res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
      res.statusCode = 200;
      if ((req.query || {}).resumo) { res.end(JSON.stringify({ total: pts.length, marcas, ex: pts.filter(p => p[2] < 6).slice(0, 12) })); return; }
      res.end(JSON.stringify({ fonte: "OpenStreetMap (© colaboradores do OpenStreetMap, ODbL)", gerado: new Date().toISOString(), servidor: url.replace(/^https:\/\/|\/api.*$/g, ""), total: pts.length, marcas, pts }));
      return;
    } catch (e) { errs.push(url.replace(/^https:\/\/|\/api.*$/g, "") + ": " + (e.name === "AbortError" ? "tempo esgotado" : e.message)); }
    finally { clearTimeout(tm); }
  }
  res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: "OpenStreetMap indisponível agora", detail: errs }));
};
