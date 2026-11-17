// Lê o Google My Maps "MAPA YALLACAR" (KML público) e devolve as áreas de risco
// e os pontos em JSON compacto para o painel.
const MID = "1WPD0IBoDn2vaaI8tlxKKPhU2mo4A4Dk";

const dec = s => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .trim();
const tag = (x, t) => { const m = x.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">")); return m ? m[1] : ""; };
const ring = s => s.trim().split(/\s+/).map(p => p.split(",").slice(0, 2).map(n => +(+n).toFixed(6))).filter(p => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));

function parse(kml) {
  const areas = [], points = [];
  const folders = kml.match(/<Folder>[\s\S]*?<\/Folder>/g) || [kml];
  for (const f of folders) {
    const folder = dec(tag(f, "name"));
    for (const pm of f.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || []) {
      const name = dec(tag(pm, "name")), desc = dec(tag(pm, "description")), style = dec(tag(pm, "styleUrl"));
      const polys = (pm.match(/<Polygon>[\s\S]*?<\/Polygon>/g) || []).map(pg => {
        const outer = ring(tag(tag(pg, "outerBoundaryIs"), "coordinates"));
        const inner = (pg.match(/<innerBoundaryIs>[\s\S]*?<\/innerBoundaryIs>/g) || []).map(i => ring(tag(i, "coordinates")));
        return [outer, ...inner].filter(r => r.length >= 3);
      }).filter(p => p.length);
      if (polys.length) { areas.push({ name: name || desc || "Área de risco", desc: desc && desc !== name ? desc : "", folder, polys }); continue; }
      const pt = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
      if (pt) { const c = ring(pt[1])[0]; if (c) points.push({ name: name || desc || "Ponto", desc: name && desc ? desc : "", folder, kind: /1539/.test(style) ? "oficina" : "ponto", lng: c[0], lat: c[1] }); }
    }
  }
  return { areas, points };
}

// Só entrega as áreas para quem está logado no painel (token de sessão validado no Supabase).
const SB = "https://sdzaddteiczjysnnrmih.supabase.co", SBK = "sb_publishable_bvTT-P1mNhHYNHwCFTW_Zg_AgvSNGpF";
const OK_TOK = new Map(); let CACHE = null;
async function sessaoOk(tok) {
  if (!/^[0-9a-f]{64}$/.test(tok || "")) return false;
  const k = OK_TOK.get(tok); if (k && Date.now() - k < 5 * 60e3) return true;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(SB + "/rest/v1/rpc/panel_me", { method: "POST", signal: c.signal, headers: { apikey: SBK, Authorization: "Bearer " + SBK, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: tok }) });
    if (!r.ok) return false;
    if (OK_TOK.size > 500) OK_TOK.clear(); OK_TOK.set(tok, Date.now()); return true;
  } catch (e) { return false; } finally { clearTimeout(t); }
}
const json = (res, code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.end(JSON.stringify(obj)); };

module.exports = async (req, res) => {
  const tok = String(req.headers["x-painel-token"] || "");
  if (!(await sessaoOk(tok))) { json(res, 401, { error: "sessao_invalida" }); return; }
  try {
    if (CACHE && Date.now() - CACHE.t < 120e3) { json(res, 200, CACHE.d); return; }
    const r = await fetch(`https://www.google.com/maps/d/kml?mid=${MID}&forcekml=1`, { redirect: "follow" });
    const txt = await r.text();
    if (!r.ok || !/<kml/i.test(txt)) {
      json(res, r.status === 200 ? 403 : 502, { error: "O mapa não está público. No Google My Maps: Compartilhar → Qualquer pessoa com o link pode ver." });
      return;
    }
    const out = parse(txt);
    out.title = dec(tag(txt, "name"));
    out.fetched = new Date().toISOString();
    CACHE = { t: Date.now(), d: out };
    json(res, 200, out);
  } catch (e) {
    json(res, 502, { error: "Falha ao buscar o mapa: " + e.message });
  }
};
