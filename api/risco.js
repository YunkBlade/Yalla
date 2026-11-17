// Segunda fonte de risco: roubo e furto de veículos por delegacia (DP) da capital paulista.
// Números: SSP-SP (estatísticas mensais por distrito policial). Contornos: GeoSampa (Prefeitura de São Paulo).
const SSP = "https://www.ssp.sp.gov.br/v1/";
const GEO = "http://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=geoportal:delegacia_policia_civil&outputFormat=application/json&srsName=EPSG:4326&maxFeatures=400";
const UA = { "User-Agent": "Mozilla/5.0 painel-relatorios/1.0", "Accept": "application/json" };
const MES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function getJSON(url, ms) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 9000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: UA }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}
// simplificação de linha (Douglas-Peucker) em graus
function simplify(pts, tol) {
  if (pts.length < 6) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let mx = 0, mi = -1; const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) { let t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L; t = Math.max(0, Math.min(1, t)); const ex = pts[i][0] - ax - t * dx, ey = pts[i][1] - ay - t * dy, d = ex * ex + ey * ey; if (d > mx) { mx = d; mi = i; } }
    if (mi > 0 && mx > tol * tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function ringArea(r) { // km², aproximação plana
  let s = 0; const k = Math.cos(-23.6 * Math.PI / 180) * 111.32;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] * k) * (r[i][1] * 110.574) - (r[i][0] * k) * (r[j][1] * 110.574);
  return Math.abs(s / 2);
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all([...Array(n)].map(async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; }

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const [geo, dist] = await Promise.all([getJSON(GEO, 15000), getJSON(SSP + "Distritos/RecuperaDistritos", 12000)]);
    // contornos por número do DP
    const shapes = {};
    for (const f of geo.features || []) {
      const nm = String((f.properties || {}).nm_delegacia_policia_civil || ""), m = nm.match(/^(\d{1,3})º\s*D\.?P/i); if (!m || !f.geometry) continue;
      const n = +m[1], polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      const s = shapes[n] || (shapes[n] = { n, name: nm.replace(/^\d+º\s*D\.?P\.?\s*/i, "").trim(), polys: [], km2: 0 });
      for (const p of polys) { const outer = simplify(p[0].map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]), 0.00022); if (outer.length >= 4) { s.polys.push([outer]); s.km2 += ringArea(outer); } }
    }
    // ids da SSP por número do DP (capital = município 565)
    const ids = {};
    for (const d of (dist.data || [])) { if (d.idMunicipio !== 565) continue; const m = String(d.sigla || "").match(/^(\d{1,3})\s*DP\b/i); if (!m) continue; (ids[+m[1]] = ids[+m[1]] || []).push({ id: d.idDistrito, sigla: d.sigla }); }
    const nums = Object.keys(shapes).map(Number).filter(n => ids[n]);
    const now = new Date(); let ano = now.getUTCFullYear();
    const read = async (y, id) => {
      const j = await getJSON(`${SSP}OcorrenciasMensais/RecuperaDadosMensaisAgrupados?ano=${y}&grupoDelito=6&tipoGrupo=DISTRITO&idGrupo=${id}`, 9000);
      const L = (((j.data || [])[0] || {}).listaDados) || [], pick = re => L.find(x => re.test(((x.delito || {}).delito) || ""));
      const rv = pick(/^ROUBO DE VE[IÍ]CULO/i), fv = pick(/^FURTO DE VE[IÍ]CULO/i), pub = Math.max((rv || {}).publicado || 0, (fv || {}).publicado || 0);
      return { pub, rv: MES.map(k => (rv || {})[k] || 0), fv: MES.map(k => (fv || {})[k] || 0) };
    };
    // decide o ano: se o ano corrente ainda tem menos de 3 meses publicados, usa o anterior
    const probe = await read(ano, ids[nums[0]][0].id).catch(() => null);
    if (!probe || probe.pub < 3) ano -= 1;
    const jobs = nums.flatMap(n => ids[n].map(x => ({ n, id: x.id })));
    const rows = await pool(jobs, 14, j => read(ano, j.id).then(r => ({ ...r, n: j.n })));
    const agg = {}; let pub = 0, fail = 0;
    rows.forEach(r => { if (!r) { fail++; return; } pub = Math.max(pub, r.pub); const a = agg[r.n] || (agg[r.n] = { rv: MES.map(() => 0), fv: MES.map(() => 0) }); r.rv.forEach((v, i) => a.rv[i] += v); r.fv.forEach((v, i) => a.fv[i] += v); });
    if (!pub) throw new Error("SSP sem meses publicados");
    const last = Math.min(3, pub), sum = (a, from, to) => a.slice(from, to).reduce((x, y) => x + y, 0);
    const areas = nums.filter(n => agg[n]).map(n => {
      const s = shapes[n], a = agg[n], rv = sum(a.rv, 0, pub), fv = sum(a.fv, 0, pub), r3 = sum(a.rv, pub - last, pub) + sum(a.fv, pub - last, pub);
      return { n, name: s.name, sigla: ids[n][0].sigla, km2: +s.km2.toFixed(2), rv, fv, tot: rv + fv, media: +((rv + fv) / pub).toFixed(1), rec: +(r3 / last).toFixed(1), dens: s.km2 > 0 ? +(((rv + fv) / pub) / s.km2).toFixed(2) : 0, polys: s.polys };
    });
    if (areas.length < 20) throw new Error("poucos distritos casados (" + areas.length + ")");
    const ord = [...areas].sort((a, b) => b.dens - a.dens); ord.forEach((a, i) => { a.rank = i + 1; a.q = +(1 - i / (ord.length - 1)).toFixed(3); });
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=1209600");
    res.statusCode = 200;
    if ((req.query || {}).resumo) { res.end(JSON.stringify({ ano, meses: pub, ate: MES[pub - 1], falhas: fail, n: areas.length, formas: Object.keys(shapes).length, bytes: JSON.stringify(areas).length, top: ord.slice(0, 8).map(a => ({ n: a.n, name: a.name, rv: a.rv, fv: a.fv, media: a.media, km2: a.km2, dens: a.dens, pts: a.polys.reduce((t, p) => t + p[0].length, 0) })), fim: ord.slice(-2).map(a => ({ n: a.n, name: a.name, media: a.media, dens: a.dens })) })); return; }
    res.end(JSON.stringify({ fonte: "SSP-SP (números) e GeoSampa (contornos das delegacias)", ano, meses: pub, ate: MES[pub - 1], recente: last, falhas: fail, gerado: now.toISOString(), areas }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store"); res.statusCode = 502; res.end(JSON.stringify({ error: e.name === "AbortError" ? "tempo esgotado" : e.message }));
  }
};
