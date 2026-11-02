/* Leitores das exportações mensais da Yalla.
   - Reservas do Yalla Digital (.xlsx "reservas_todas"): agregadas por mês da DATA DA RESERVA.
     Nenhum dado pessoal (nome, CPF, telefone, vendedor) sai deste leitor — só contagens.
   - Relatório de campanhas da Meta (.csv) e fatura da Meta (.csv "VERBA").
   Funcionam no navegador (XLSX global) e no Node (require("xlsx")). */
const MES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const monthLabel = (mm, yyyy) => `${MES_ABR[+mm - 1]}/${String(yyyy).slice(-2)}`;
const monthSortKey = l => { const [m, y] = l.split("/"); return y + String(MES_ABR.indexOf(m)).padStart(2, "0"); };
const STATUS_LEAD_ORDER = ["Contratos Comissionáveis","Contrato Enviado","Aprovado","Acordo Pendente","Pendente Documento","Segunda Validação","Clientes Futuros","Reprovado","Lead Perdido"];

function parseBRDate(v){
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number"){ const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()); }
  const m = String(v).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}

/* ---------- reservas ---------- */
function aggregateReservas(XLSX, buffers){
  const seen = new Set(), months = {};
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  for (const buf of buffers){
    const wb = XLSX.read(buf, {type: buf instanceof ArrayBuffer ? "array" : "buffer"});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null, raw: false});
    for (const r of rows){
      const prot = r["Protocolo"]; if (prot && seen.has(prot)) continue; if (prot) seen.add(prot);
      const res = parseBRDate(r["Data da reserva"]), sol = parseBRDate(r["Data da solicitação"]);
      if (!res) continue;
      const key = monthLabel(res.getMonth() + 1, res.getFullYear());
      const M = months[key] = months[key] || {total:0, statusLead:{}, modalidade:{}, origem:{}, modelos:{}, modelosContr:{}, modalidadeContr:{}, origemContr:{}, ant:[], heat:Array.from({length:7}, () => Array(12).fill(0)), first:null, last:null};
      M.total++;
      const st = r["Status do Lead"] || "Sem status"; bump(M.statusLead, st);
      bump(M.modalidade, r["Modalidade"] || "Sem modalidade");
      bump(M.origem, r["Origem"] || "Sem origem");
      const mod = r["Veículo / Modelo"] || "Sem modelo"; bump(M.modelos, mod);
      if (st === "Contratos Comissionáveis"){ bump(M.modelosContr, mod); bump(M.modalidadeContr, r["Modalidade"] || "Sem modalidade"); bump(M.origemContr, r["Origem"] || "Sem origem"); }
      if (sol){
        const a = Math.round((new Date(res.getFullYear(), res.getMonth(), res.getDate()) - new Date(sol.getFullYear(), sol.getMonth(), sol.getDate())) / 864e5);
        if (a >= 0 && a < 120) M.ant.push(a);
        M.heat[(sol.getDay() + 6) % 7][Math.floor(sol.getHours() / 2)]++;
      }
      const d = `${res.getFullYear()}-${String(res.getMonth() + 1).padStart(2, "0")}-${String(res.getDate()).padStart(2, "0")}`;
      if (!M.first || d < M.first) M.first = d; if (!M.last || d > M.last) M.last = d;
    }
  }
  for (const k in months){ const a = months[k].ant.sort((x, y) => x - y); months[k].antMediana = a.length ? a[Math.floor(a.length / 2)] : null; delete months[k].ant; }
  return months;
}

/* ---------- Meta: relatório de campanhas ---------- */
function metaLine(c){
  const u = String(c || "").toUpperCase();
  if (u.includes("GREEN")) return "GREEN"; if (u.includes("[RENT]")) return "RENT"; if (u.includes("DREAM")) return "DREAM";
  if (u.includes("[TRUST]")) return "TRUST"; if (u.includes("SITE")) return "SITE"; if (u.includes("CARGAS")) return "CARGAS"; return "OUTRAS";
}
function parseMetaCampaigns(XLSX, text){
  text = String(text).replace(/^\uFEFF/, "");
  const wb = XLSX.read(text, {type: "string", raw: true});
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null, raw: true});
  const num = v => v == null || v === "" ? 0 : typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")) || 0;
  let key = null; const out = [];
  for (const r of rows){
    const sp = num(r["Valor gasto (BRL)"]); if (sp < 0.5) continue;
    const ini = String(r["Início dos relatórios"] || ""); const m = ini.match(/^(\d{4})-(\d{2})/);
    if (m && !key) key = monthLabel(m[2], m[1]);
    out.push({c: r["Nome da campanha"], a: r["Nome do conjunto de anúncios"], l: metaLine(r["Nome da campanha"]), reach: num(r["Alcance"]), impr: num(r["Impressões"]),
      freq: +num(r["Frequência"]).toFixed(2), rt: r["Tipo de resultado"] || "", res: num(r["Resultados"]), spend: +sp.toFixed(2), leads: num(r["Leads"])});
  }
  if (!key) throw new Error("Não achei a coluna 'Início dos relatórios' — confira se é o relatório de campanhas da Meta.");
  return {month: key, rows: out.sort((a, b) => b.spend - a.spend)};
}

/* ---------- Meta: fatura (relatório de cobrança) ---------- */
function parseMetaBill(text){
  const p = text.match(/Relatório de cobrança:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!p) throw new Error("Não achei 'Relatório de cobrança' — confira se é a fatura da Meta.");
  const tots = [...text.matchAll(/Valor total cobrado,"?([\d.,]+)"?/g)].map(m => parseFloat(m[1].replace(/\./g, "").replace(",", ".")));
  return {month: monthLabel(p[2], p[3]), bill: +(tots[0] || 0).toFixed(2), credit: +tots.slice(1).reduce((a, b) => a + b, 0).toFixed(2)};
}

/* ---------- Google Ads: "Cards da Visão geral" (CSVs do .zip) ---------- */
const numBR = v => { if (v == null) return 0; if (typeof v === "number") return v;
  const t = String(v).replace(/R\$|\s|%/g, "").replace(/\./g, "").replace(",", "."); const n = parseFloat(t); return isNaN(n) ? 0 : n; };
function csvRows(XLSX, text){
  text = String(text).replace(/^﻿/, "");
  const wb = XLSX.read(text, {type: "string", raw: true});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval: null, raw: true});
}
const googleLine = c => { const m = String(c || "").match(/^\[([^\]]+)\]/); return m ? m[1].toUpperCase() : "OUTRAS"; };
/* files: [{name, text}] — um ou vários meses; o mês vem do nome do arquivo (AAAA.MM.DD-AAAA.MM.DD) */
function parseGoogleCards(XLSX, files){
  const months = {};
  for (const f of files){
    const m = f.name.match(/\((?:[^_)]*_)?(\d{4})\.(\d{2})\.\d{2}-\d{4}\.\d{2}\.\d{2}/); if (!m) continue;
    const key = monthLabel(m[2], m[1]); const G = months[key] = months[key] || {};
    const base = f.name.replace(/^.*\//, "");
    const rows = csvRows(XLSX, f.text);
    if (/^Campanhas/i.test(base)) G.campaigns = rows.map(r => ({c: r["Nome da campanha"], l: googleLine(r["Nome da campanha"]), status: r["Status da campanha"], cost: numBR(r["Custo"]), conv: numBR(r["Conversões"])})).sort((a, b) => b.cost - a.cost);
    else if (/^Redes/i.test(base)) G.networks = rows.map(r => ({n: r["Rede"], clicks: numBR(r["Cliques"]), cost: numBR(r["Custo"])}));
    else if (/^Dispositivos/i.test(base)) G.devices = rows.map(r => ({d: r["Dispositivo"], cost: numBR(r["Custo"]), clicks: numBR(r["Cliques"]), conv: numBR(r["Conversões"])}));
    else if (/^Palavras-chave/i.test(base)) G.keywords = rows.slice(0, 15).map(r => ({k: r["Palavra-chave da rede de pesquisa"], match: r["Tipo de corresp."], cost: numBR(r["Custo"]), clicks: numBR(r["Cliques"]), ctr: numBR(r["CTR"])}));
    else if (/^Pesquisas\(Pesquisar/i.test(base)) G.searches = rows.slice(0, 15).map(r => ({q: r["Pesquisar"], cost: numBR(r["Custo"]), clicks: numBR(r["Cliques"]), impr: numBR(r["Impressões"]), conv: numBR(r["Conversões"])}));
    else if (/^Pesquisas\(Palavra/i.test(base)) G.words = rows.slice(0, 15).map(r => ({w: r["Palavra"], cost: numBR(r["Custo"]), clicks: numBR(r["Cliques"]), impr: numBR(r["Impressões"]), top: r["Principais consultas com a palavra"]}));
    else if (/^S.rie_temporal/i.test(base)) G.daily = rows.map(r => ({clicks: numBR(r["Cliques"]), conv: numBR(r["Conversões"])}));
    else if (/Idade_\d/i.test(base) && !/Sexo/i.test(base)) G.age = rows.map(r => ({a: r["Faixa de idade"], impr: numBR(r["Impressões"])}));
  }
  for (const k in months){ const G = months[k];
    G.cost = +(G.campaigns || []).reduce((s, c) => s + c.cost, 0).toFixed(2);
    G.conv = +(G.campaigns || []).reduce((s, c) => s + c.conv, 0).toFixed(2);
    G.clicks = (G.networks || []).reduce((s, n) => s + n.clicks, 0) || (G.daily || []).reduce((s, d) => s + d.clicks, 0);
  }
  return months;
}
if (typeof module !== "undefined") module.exports = {aggregateReservas, parseMetaCampaigns, parseMetaBill, parseGoogleCards, monthSortKey, STATUS_LEAD_ORDER};
