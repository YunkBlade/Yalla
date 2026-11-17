// Diagnóstico temporário: lê páginas públicas de lojas das locadoras para achar a lista oficial.
const OK = /^https:\/\/([a-z0-9-]+\.)*(localiza\.com|movida\.com\.br|unidas\.com\.br|focoaluguel\.com\.br|kovi\.com\.br|moover\.com\.br|zarp\.localiza\.com|nationalcar\.com|enterprise\.com|avis\.com\.br|hertz\.com\.br)\//i;
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  const u = String((req.query && req.query.url) || ""), de = +(req.query.de || 0), ate = Math.min(+(req.query.ate || 20000), de + 60000);
  if (!OK.test(u)) { res.statusCode = 400; res.end(JSON.stringify({ error: "host" })); return; }
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(u, { signal: c.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; painel-relatorios/1.0)", "Accept": req.query.json ? "application/json" : "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9" } });
    const txt = await r.text();
    const apis = [...new Set((txt.match(/https?:\/\/[^"'\s<>\\]+/g) || []).filter(x => /api|json|loja|agenc|store|branch|location|unidade/i.test(x)))].slice(0, 80);
    const caminhos = [...new Set((txt.match(/["'](\/[^"'\s<>]*(api|loja|agenc|store|branch|location|unidade)[^"'\s<>]*)["']/gi) || []).map(x => x.slice(1, -1)))].slice(0, 80);
    res.end(JSON.stringify({ s: r.status, url: r.url, tipo: r.headers.get("content-type"), tam: txt.length, apis, caminhos, trecho: txt.slice(de, ate) }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); } finally { clearTimeout(t); }
};
