// Localização exata de endereços (em construção): diagnóstico das camadas da GeoSampa.
const W = "http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs";
async function txt(url, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 15000); try { const r = await fetch(url, { signal: c.signal }); return { s: r.status, t: await r.text() }; } finally { clearTimeout(t); } }
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  try {
    if (q.diag === "caps") {
      const r = await txt(W + "?service=WFS&version=1.0.0&request=GetCapabilities", 25000);
      const names = [...r.t.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1]).filter(n => /lote|porta|ender|numer|logra|imovel|iptu/i.test(n));
      res.end(JSON.stringify({ s: r.s, n: names })); return;
    }
    if (q.diag === "desc" && /^[a-z0-9_]+$/i.test(q.layer || "")) {
      const r = await txt(W + "?service=WFS&version=1.0.0&request=DescribeFeatureType&typeName=geoportal:" + q.layer);
      res.end(JSON.stringify({ s: r.s, t: r.t.slice(0, 6000) })); return;
    }
    if (q.diag === "amostra" && /^[a-z0-9_]+$/i.test(q.layer || "")) {
      const f = q.f ? "&CQL_FILTER=" + encodeURIComponent(String(q.f).slice(0, 300)) : "";
      const r = await txt(W + "?service=WFS&version=1.0.0&request=GetFeature&typeName=geoportal:" + q.layer + "&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=3" + f, 25000);
      res.end(JSON.stringify({ s: r.s, t: r.t.slice(0, 5000) })); return;
    }
    res.statusCode = 400; res.end(JSON.stringify({ error: "parametro" }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
};
