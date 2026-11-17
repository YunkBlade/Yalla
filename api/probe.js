// Sonda temporária (será removida): lê uma URL de fontes públicas permitidas e devolve um trecho.
module.exports = async (req, res) => {
  const q = req.query || {}, u = String(q.u || "");
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  let host = ""; try { host = new URL(u).hostname; } catch (e) {}
  if (!/(^|\.)ssp\.sp\.gov\.br$|(^|\.)prefeitura\.sp\.gov\.br$|(^|\.)ibge\.gov\.br$/.test(host)) { res.statusCode = 400; res.end('{"error":"host"}'); return; }
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 painel-relatorios/1.0", "Accept": "*/*" } });
    const t = await r.text(); let out;
    if (q.find) { const re = new RegExp(String(q.find), "g"), m = []; let x; while ((x = re.exec(t)) && m.length < 80) { m.push(t.slice(Math.max(0, x.index - (+q.ctx || 0)), x.index + x[0].length + (+q.ctx || 0))); } out = [...new Set(m)]; }
    else out = t.slice(+q.from || 0, (+q.from || 0) + (+q.n || 3000));
    res.statusCode = 200; res.end(JSON.stringify({ status: r.status, type: r.headers.get("content-type"), len: t.length, out }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
};
