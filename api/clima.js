// Tempo para o painel.
//   /api/clima                  -> condição observada AGORA nos aeroportos do Brasil (METAR, aviationweather.gov, domínio público)
//   /api/clima?lat=..&lon=..    -> previsão das próximas horas e dias para o ponto (MET Norway, CC BY 4.0)
//   /api/clima?tipo=alertas     -> avisos meteorológicos ativos do INMET (hoje e próximos dias)
const UA = { "User-Agent": "painel-relatorios/1.0 (+https://yalla-relatorios.vercel.app)", "Accept": "application/json" };
async function get(url, ms) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 8000); try { const r = await fetch(url, { signal: c.signal, headers: UA }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); } finally { clearTimeout(t); } }
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let mx = 0, mi = -1; const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) { let t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L; t = Math.max(0, Math.min(1, t)); const ex = pts[i][0] - ax - t * dx, ey = pts[i][1] - ay - t * dy, d = ex * ex + ey * ey; if (d > mx) { mx = d; mi = i; } }
    if (mi > 0 && mx > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
// tipo de tempo a partir do METAR
function wxMetar(m) {
  const w = String(m.wxString || ""), cov = String(m.cover || ""), night = (() => { const h = (new Date(m.obsTime * 1000).getUTCHours() + 24 + Math.round((+m.lon || -45) / 15)) % 24; return h < 6 || h >= 18; })();
  if (/TS/.test(w)) return "tempestade";
  if (/\+RA|\+SHRA/.test(w)) return "chuva_forte";
  if (/RA|DZ|SH/.test(w)) return "chuva";
  if (/FG|BR|HZ|FU/.test(w)) return "nevoa";
  if (/OVC|BKN/.test(cov)) return "nublado";
  if (/SCT|FEW/.test(cov)) return night ? "parcial_noite" : "parcial";
  return night ? "limpo_noite" : "limpo";
}
function wxSym(s) { // símbolo da MET Norway
  s = String(s || ""); const n = /_night/.test(s);
  if (/thunder/.test(s)) return "tempestade";
  if (/heavyrain|heavysleet/.test(s)) return "chuva_forte";
  if (/rain|sleet|drizzle/.test(s)) return "chuva";
  if (/snow/.test(s)) return "neve";
  if (/fog/.test(s)) return "nevoa";
  if (/^cloudy/.test(s)) return "nublado";
  if (/partlycloudy|fair/.test(s)) return n ? "parcial_noite" : "parcial";
  if (/clearsky/.test(s)) return n ? "limpo_noite" : "limpo";
  return "nublado";
}
module.exports = async (req, res) => {
  const q = req.query || {};
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (q.tipo === "alertas") {
      const j = await get("https://apiprevmet3.inmet.gov.br/avisos/ativos", 9000), out = [];
      for (const grupo of ["hoje", "futuro"]) for (const a of (j[grupo] || [])) {
        let poly = null; try { const g = JSON.parse(a.poligono || "null"); if (g && g.type === "Polygon") poly = [g.coordinates.map(r => simplify(r.map(c => [+(+c[0]).toFixed(3), +(+c[1]).toFixed(3)]), 0.03))]; else if (g && g.type === "MultiPolygon") poly = g.coordinates.map(p => p.map(r => simplify(r.map(c => [+(+c[0]).toFixed(3), +(+c[1]).toFixed(3)]), 0.03))); } catch (e) {}
        const geo = String(a.geocodes || "").split(",");
        out.push({ id: a.id_aviso + "-" + (a.id_sequencia || 1), grupo, evento: a.descricao || "", sev: a.severidade || "", nivel: a.id_severidade || 0, cor: a.aviso_cor || "#FFFE00", ini: a.inicio || "", fim: a.fim || "",
          riscos: (a.riscos || []).slice(0, 2).map(s => String(s).slice(0, 300)), instr: (a.instrucoes || []).slice(0, 3).map(s => String(s).slice(0, 300)),
          estados: a.estados || "", nmun: geo.filter(Boolean).length, sp: geo.includes("3550308"), gsp: ["3550308", "3518800", "3534401", "3547809", "3548708", "3548807", "3513801", "3529401", "3505708", "3510609", "3552809", "3513009"].filter(c => geo.includes(c)), poly });
      }
      res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
      res.statusCode = 200; res.end(JSON.stringify({ fonte: "INMET (alertas.inmet.gov.br)", gerado: new Date().toISOString(), alertas: out })); return;
    }
    if (q.lat != null && q.lon != null) {
      const lat = Math.max(-60, Math.min(15, +q.lat || 0)).toFixed(2), lon = Math.max(-80, Math.min(-30, +q.lon || 0)).toFixed(2);
      const j = await get(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, 8000), ts = ((j.properties || {}).timeseries) || [];
      const horas = ts.slice(0, 25).map(t => { const d = t.data || {}, i = (d.instant || {}).details || {}, n1 = d.next_1_hours || d.next_6_hours || {}; return { t: t.time, temp: i.air_temperature, umid: i.relative_humidity, vento: i.wind_speed != null ? +(i.wind_speed * 3.6).toFixed(0) : null, dir: i.wind_from_direction, chuva: ((n1.details || {}).precipitation_amount) ?? null, tipo: wxSym((n1.summary || {}).symbol_code) }; });
      const dias = {}; ts.forEach(t => { const loc = new Date(new Date(t.time).getTime() - 3 * 3600e3), k = loc.toISOString().slice(0, 10), h = loc.getUTCHours(), d = t.data || {}, i = (d.instant || {}).details || {}; const o = dias[k] || (dias[k] = { dia: k, min: 99, max: -99, chuva: 0, tipo: null, _h: 99 });
        if (i.air_temperature != null) { o.min = Math.min(o.min, i.air_temperature); o.max = Math.max(o.max, i.air_temperature); }
        const n1 = d.next_1_hours, n6 = d.next_6_hours; if (n1) o.chuva += (n1.details || {}).precipitation_amount || 0; else if (n6 && h % 6 === 0) o.chuva += (n6.details || {}).precipitation_amount || 0;
        const s = (n6 || n1 || {}).summary; if (s && Math.abs(h - 12) < Math.abs(o._h - 12)) { o.tipo = wxSym(s.symbol_code); o._h = h; } });
      const lista = Object.values(dias).filter(d => d.max > -99).slice(0, 7).map(d => ({ dia: d.dia, min: Math.round(d.min), max: Math.round(d.max), chuva: +d.chuva.toFixed(1), tipo: d.tipo || "nublado" }));
      res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=7200");
      res.statusCode = 200; res.end(JSON.stringify({ fonte: "MET Norway (api.met.no), licença CC BY 4.0", lat: +lat, lon: +lon, atualizado: ((j.properties || {}).meta || {}).updated_at, horas, dias: lista })); return;
    }
    const m = await get("https://aviationweather.gov/api/data/metar?bbox=-34.5,-74.5,5.5,-28.5&format=json", 9000);
    const est = (Array.isArray(m) ? m : []).filter(x => / BR$/.test(String(x.name || "")) && x.temp != null && x.lat != null).map(x => {
      const t = x.temp, d = x.dewp, umid = d != null ? Math.round(100 * Math.exp(17.625 * d / (243.04 + d)) / Math.exp(17.625 * t / (243.04 + t))) : null;
      return { id: x.icaoId, nome: String(x.name || "").replace(/, [A-Z]{2}, BR$/, "").replace(/\s+(Intl|Arpt|Airport)\b.*$/i, "").trim(), uf: (String(x.name || "").match(/, ([A-Z]{2}), BR$/) || [])[1] || "", lat: +x.lat, lon: +x.lon,
        temp: t, umid, vento: x.wspd != null ? Math.round(x.wspd * 1.852) : null, dir: x.wdir, vis: x.visib, wx: x.wxString || "", nuvens: x.cover || "", tipo: wxMetar(x), obs: x.obsTime ? new Date(x.obsTime * 1000).toISOString() : x.reportTime, raw: x.rawOb };
    });
    const by = {}; est.forEach(e => { if (!by[e.id] || by[e.id].obs < e.obs) by[e.id] = e; });
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.statusCode = 200; res.end(JSON.stringify({ fonte: "aviationweather.gov (METAR dos aeroportos, domínio público)", gerado: new Date().toISOString(), estacoes: Object.values(by) }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: e.name === "AbortError" ? "tempo esgotado" : e.message }));
  }
};
