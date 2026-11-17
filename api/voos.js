// Aviões no ar agora em volta de um ponto (dados abertos ADS-B: adsb.lol, com reservas adsb.fi e airplanes.live).
// Uso: /api/voos?lat=-23.55&lon=-46.63&r=250  (r em milhas náuticas, máx. 250)
module.exports = async (req, res) => {
  const q = req.query || {};
  const num = (v, d, lo, hi) => { const n = parseFloat(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const lat = num(q.lat, -23.55, -60, 15).toFixed(2), lon = num(q.lon, -46.63, -80, -30).toFixed(2), r = Math.round(num(q.r, 250, 20, 250));
  const sources = [
    ["adsb.lol", `https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`],
    ["adsb.fi", `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${r}`],
    ["airplanes.live", `https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`]
  ];
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const errs = [];
  for (const [name, url] of sources) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
    try {
      const rr = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "painel-relatorios/1.0", "Accept": "application/json" } });
      clearTimeout(tm);
      if (!rr.ok) throw new Error("http " + rr.status);
      const j = await rr.json(), list = j.ac || j.aircraft || [];
      const ac = list.filter(a => a && typeof a.lat === "number" && typeof a.lon === "number" && a.alt_baro !== "ground" && (a.seen_pos == null || a.seen_pos < 60))
        .map(a => ({
          id: String(a.hex || "").slice(0, 8), cs: String(a.flight || "").trim().slice(0, 10), reg: String(a.r || "").slice(0, 10), tp: String(a.t || "").slice(0, 6),
          lat: +a.lat.toFixed(5), lng: +a.lon.toFixed(5), alt: typeof a.alt_baro === "number" ? a.alt_baro : (typeof a.alt_geom === "number" ? a.alt_geom : null),
          gs: typeof a.gs === "number" ? +a.gs.toFixed(1) : null, trk: typeof a.track === "number" ? +a.track.toFixed(1) : (typeof a.true_heading === "number" ? +a.true_heading.toFixed(1) : null),
          age: typeof a.seen_pos === "number" ? +a.seen_pos.toFixed(1) : 0
        })).slice(0, 400);
      res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=20");
      res.statusCode = 200; res.end(JSON.stringify({ src: name, now: Date.now(), lat: +lat, lon: +lon, r, ac })); return;
    } catch (e) { clearTimeout(tm); errs.push(name + ": " + (e.name === "AbortError" ? "tempo esgotado" : e.message)); }
  }
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 502; res.end(JSON.stringify({ error: "fontes indisponíveis", detail: errs }));
};
