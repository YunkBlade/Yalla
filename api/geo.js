// Geocodifica um endereço no Brasil (OpenStreetMap/Nominatim). Uso pontual do painel.
module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || "").slice(0, 200);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (q.length < 5) { res.statusCode = 400; res.end('{"error":"q"}'); return; }
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=2&q=" + encodeURIComponent(q), { headers: { "User-Agent": "painel-relatorios/1.0" } });
    const j = await r.json();
    res.statusCode = 200; res.end(JSON.stringify(j.map(x => ({ n: x.display_name, lat: +x.lat, lng: +x.lon, t: x.type }))));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
};
