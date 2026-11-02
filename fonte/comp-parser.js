/* Leitor da planilha "Comparativo Yalla x Concorrentes".
   Funciona no navegador (SheetJS global XLSX) e no Node (require("xlsx")).
   Localiza as tabelas pelo nome das colunas, não por posição fixa. */
function parseCompetition(XLSX, data, fileName){
  const wb = XLSX.read(data, {type: data instanceof ArrayBuffer ? "array" : "buffer"});
  const rowsOf = n => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, defval:null}) : [];
  const clean = v => v == null ? null : (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);
  const numv = v => { if (v == null || v === "") return null; if (typeof v === "number") return v;
    const n = parseFloat(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isNaN(n) ? null : n; };
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  function table(sheet, must, map, opt = {}){
    const rows = rowsOf(sheet); if (!rows.length) return [];
    const h = rows.findIndex(r => must.every(m => r.some(c => norm(c) === norm(m))));
    if (h < 0) return [];
    const head = rows[h].map(norm), out = [];
    const idx = {}; for (const k in map){ const t = map[k];
      idx[k] = t instanceof RegExp ? head.findIndex(x => t.test(x)) : head.indexOf(norm(t)); }
    for (let i = h + 1; i < rows.length; i++){
      const r = rows[i], filled = r.filter(v => clean(v) != null).length;
      if (filled === 0){ if (out.length && opt.stopOnBlank) break; continue; }
      if (filled <= 1 && out.length) break;            /* linha de nota: fim da tabela */
      const o = {}; for (const k in idx) o[k] = idx[k] >= 0 ? clean(r[idx[k]]) : null;
      if (opt.key && o[opt.key] == null) continue;
      out.push(o);
    }
    return out;
  }

  /* ---- data da consulta e ressalvas */
  const exec = rowsOf("Painel Executivo");
  const textCells = exec.map(r => r.filter(v => clean(v) != null)).filter(r => r.length === 1 && typeof r[0] === "string");
  const allText = textCells.map(r => r[0]).join(" ");
  const dm = allText.match(/(\d{2}\/\d{2}\/\d{4})/) || String(fileName || "").match(/(\d{2})-(\d{2})-(\d{4})/);
  const date = dm ? (dm[1].includes("/") ? dm[1] : `${dm[1]}/${dm[2]}/${dm[3]}`) : null;
  const notes = textCells.slice(1).map(r => r[0]).filter(t => !/^PRIORIDADE/i.test(t) && t.length > 30);

  /* ---- prioridades */
  const priorities = [];
  const pi = exec.findIndex(r => r.some(c => /^PRIORIDADE/i.test(String(c || ""))));
  if (pi >= 0) for (let i = pi + 1; i < exec.length; i++){
    const r = exec[i].map(clean); if (!r[0]) break;
    if (r[1] && r[2]) priorities.push({model: r[0], text: r[1], tag: r[2]});
    else break;
  }

  /* ---- tabelas */
  const frota = table("Frota Yalla", ["Modelo Yalla", "Categoria"], {
    cat:"Categoria", marca:"Marca", modelo:"Modelo Yalla", motor:"Motorização", cambio:"Câmbio",
    p5:/^5\.000 km/, p6:/^6\.000 km/, livre:/^km livre/, produto:"Produto na vitrine", revisao:"Revisão", hist:/^reserva historica/
  }, {key:"modelo"});

  const comparativo = table("Comparativo", ["Modelo Yalla", "Conc. R$/sem."], {
    cat:"Categoria", modelo:"Modelo Yalla", yalla:"Yalla R$/sem.", conc:"Concorrente / locadora", concModelo:"Modelo concorrente",
    concPreco:"Conc. R$/sem.", gap:"Gap R$/sem.", gapPct:"Gap %", equiv:"Equivalência", obs:"Interpretação / cuidados",
    fonte:"Fonte concorrente", id:"ID oferta", status:"Status de comparabilidade", produto:"Produto da Yalla"
  }, {key:"modelo"});

  const radarSheet = wb.SheetNames.filter(n => /^radar/i.test(n))
    .map(n => ({n, d: (n.match(/(\d{2})-(\d{2})/) || [])}))
    .filter(x => x.d.length).sort((a, b) => (a.d[2] + a.d[1]).localeCompare(b.d[2] + b.d[1]))
    .map(x => x.n).reverse().find(n => table(n, ["Modelo Yalla", "Conc. R$/sem."], {m:"Modelo Yalla"}).length);
  const radar = radarSheet ? table(radarSheet, ["Modelo Yalla", "Conc. R$/sem."], {
    modelo:"Modelo Yalla", modalidade:"Modalidade", yalla:"Yalla R$/sem.", conc:"Locadora concorrente", oferta:/^oferta/,
    preco:"Conc. R$/sem.", gap:"Gap Yalla R$", gapPct:/^gap vs/, situacao:/^situacao/, condicao:/^condicao/, fonte:"Fonte rival"
  }, {key:"modelo"}) : [];

  const ofertas = table("Ofertas Concorrentes", ["ID", "R$/semana"], {
    id:"ID", locadora:"Nome da locadora / canal", modelo:"Modelo anunciado", preco:"R$/semana", tipo:"Tipo de tarifa",
    km:"Quilometragem", caucao:"Caução R$", praca:"Praça", equiv:"Equivalência", fonte:"Fonte / link", obs:"Observação / condição",
    produto:"Produto deste anúncio", revisao:"Revisão pública", status:"Status", anterior:"Tarifa anterior R$/sem.",
    natureza:/^natureza do preco/, validade:"Controle de validade / ressalva"
  }, {key:"id"});

  const rent = table("Rent - Diarias", ["Locadora", "Plano Rent"], {
    locadora:"Locadora", plano:"Plano Rent", modelo:"Modelo / grupo", regime:"Regime", preco:"Preço diário anunciado R$",
    outros:"Outros valores publicados", ressalva:"Ressalvas de comparação", fonte:"Fonte URL", status:"Status"
  }, {key:"locadora"});

  const dream = table("Dream - Compra", ["Concorrente", "Plano"], {
    empresa:"Concorrente", plano:"Plano", modelo:"Modelo/versão", segmento:"Segmento", semanal:"Semanal visível R$",
    prazo:"Prazo / momento compra", entrada:"Entrada / caução", status:"Status da condição", obs:"Observações", fonte:"Fonte oficial"
  }, {key:"empresa"});

  const benchmarks = table("Benchmarks Categoria", ["Categoria", "Concorrente / fornecedor"], {
    cat:"Categoria", empresa:"Concorrente / fornecedor", preco:"Preço sem./base", cond:"Condição", fonte:"Link de fonte"
  }, {key:"cat"});

  /* ---- histórico de preços Yalla (todas as abas "Historico ...") */
  const yHist = {};
  wb.SheetNames.filter(n => /^historico/i.test(norm(n))).forEach(n => {
    const rows = rowsOf(n);
    const h = rows.findIndex(r => r.some(c => /^modelo/.test(norm(c))));
    if (h < 0) return;
    const head = rows[h].map(c => String(c || ""));
    const mi = head.findIndex(c => /^modelo/i.test(norm(c)));
    const cols = [];
    head.forEach((c, i) => {
      let m = c.match(/^(\d{2}\/\d{2})\s*•\s*5 mil/i) || c.match(/^Yalla (\d{2}\/\d{2})$/i);
      if (m) cols.push({i, d: m[1]});
    });
    if (!cols.length) return;
    for (let r = h + 1; r < rows.length; r++){
      const filled = rows[r].filter(v => clean(v) != null).length;
      if (filled <= 1) break;                                         /* nota: fim da tabela */
      if (rows[r].some(c => /^(locadora|modelo)/.test(norm(c)))) break; /* começou outra tabela */
      const model = clean(rows[r][mi]); if (!model || typeof model !== "string") continue;
      cols.forEach(c => { const v = numv(rows[r][c.i]); if (v){ (yHist[model] = yHist[model] || {})[c.d] = v; } });
    }
  });
  /* preço atual da frota entra como ponto da data da consulta */
  if (date) frota.forEach(f => { const v = numv(f.p5); if (v) (yHist[f.modelo] = yHist[f.modelo] || {})[date.slice(0, 5)] = v; });

  /* normaliza números */
  comparativo.forEach(c => { c.yalla = numv(c.yalla); c.concPreco = numv(c.concPreco); c.gap = numv(c.gap); c.gapPct = numv(c.gapPct); });
  radar.forEach(c => { c.yalla = numv(c.yalla); c.preco = numv(c.preco); c.gap = numv(c.gap); c.gapPct = numv(c.gapPct); });
  ofertas.forEach(o => { o.preco = numv(o.preco); o.anterior = numv(o.anterior); o.caucao = numv(o.caucao); });
  frota.forEach(f => { f.p5 = numv(f.p5); f.p6 = numv(f.p6); f.livre = numv(f.livre); f.hist = numv(f.hist); });
  rent.forEach(r => r.preco = numv(r.preco)); dream.forEach(d => d.semanal = numv(d.semanal)); benchmarks.forEach(b => b.preco = numv(b.preco));

  return {file: fileName || null, date, importedAt: new Date().toISOString(), notes, priorities,
    frota, comparativo, radarSheet, radar, ofertas, rent, dream, benchmarks, yHist};
}
if (typeof module !== "undefined") module.exports = {parseCompetition};
