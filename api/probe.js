// Sonda temporária (será removida): testa fontes públicas a partir do servidor do painel.
const OK = /(^|\.)(ssp\.sp\.gov\.br|prefeitura\.sp\.gov\.br|cetsp\.com\.br|met\.no|inmet\.gov\.br|adsbdb\.com|adsb\.lol|adsb\.fi|rainviewer\.com|brasilapi\.com\.br|sptrans\.com\.br|aviationweather\.gov|open-meteo\.com|cptec\.inpe\.br|yalla-relatorios\.vercel\.app)$/;
module.exports = async (req, res) => {
  const q = req.query || {}, u = String(q.u || "");
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  let host = ""; try { host = new URL(u).hostname; } catch (e) {}
  if (!OK.test(host)) { res.statusCode = 400; res.end('{"error":"host"}'); return; }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000), t0 = Date.now();
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "*/*" } });
    const t = await r.text(); let out;
    if (q.find) { const re = new RegExp(String(q.find), "g"), m = []; let x; while ((x = re.exec(t)) && m.length < 60) { m.push(t.slice(Math.max(0, x.index - (+q.ctx || 0)), x.index + x[0].length + (+q.ctx || 0))); } out = [...new Set(m)]; }
    else out = t.slice(+q.from || 0, (+q.from || 0) + (+q.n || 2500));
    res.statusCode = 200; res.end(JSON.stringify({ status: r.status, ms: Date.now() - t0, type: r.headers.get("content-type"), len: t.length, out }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.name === "AbortError" ? "tempo esgotado" : e.message, ms: Date.now() - t0 })); }
  finally { clearTimeout(tm); }
};
