// Geocodifica um endereço no Brasil (OpenStreetMap/Nominatim). Uso pontual do painel.
module.exports = async (req, res) => {
  const g = k => String((req.query && req.query[k]) || "").slice(0, 160);
  const street = g("street"), city = g("city") || "São Paulo", q = g("q");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (street.length < 4 && q.length < 5) { res.statusCode = 400; res.end('{"error":"street ou q"}'); return; }
  const base = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=2&";
  const url = street ? base + "street=" + encodeURIComponent(street) + "&city=" + encodeURIComponent(city) + "&state=" + encodeURIComponent("São Paulo") : base + "q=" + encodeURIComponent(q);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "painel-relatorios/1.0" } });
    const j = await r.json();
    res.statusCode = 200; res.end(JSON.stringify(j.map(x => ({ n: x.display_name, lat: +x.lat, lng: +x.lon, t: x.type }))));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
};
