// Rota de um voo pelo indicativo (callsign): origem e destino.
// Fonte: adsbdb.com (base pública de rotas por indicativo). ADS-B não transmite rota; é a rota cadastrada para o indicativo.
module.exports = async (req, res) => {
  const cs = String((req.query || {}).cs || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cs.length < 3) { res.statusCode = 400; res.end('{"error":"cs"}'); return; }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
  const ap = a => a ? { iata: a.iata_code || "", icao: a.icao_code || "", nome: a.name || "", cidade: a.municipality || "", pais: a.country_name || "", lat: +a.latitude, lng: +a.longitude } : null;
  try {
    const r = await fetch("https://api.adsbdb.com/v0/callsign/" + cs, { signal: ctl.signal, headers: { "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "application/json" } });
    if (r.status === 404) { res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400"); res.statusCode = 200; res.end(JSON.stringify({ cs, sem: true })); return; }
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json(), f = ((j || {}).response || {}).flightroute;
    if (!f || !f.origin || !f.destination) { res.setHeader("Cache-Control", "public, s-maxage=21600"); res.statusCode = 200; res.end(JSON.stringify({ cs, sem: true })); return; }
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.end(JSON.stringify({ cs, voo: f.callsign_iata || f.callsign || cs, cia: (f.airline || {}).name || "", o: ap(f.origin), m: ap(f.midpoint), d: ap(f.destination), fonte: "adsbdb.com" }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: e.name === "AbortError" ? "tempo esgotado" : e.message }));
  } finally { clearTimeout(tm); }
};
